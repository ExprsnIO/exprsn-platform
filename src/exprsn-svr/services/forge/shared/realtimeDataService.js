/**
 * Real-Time Data Service
 * Handles real-time data refresh with prefetching and pagination
 */

const redis = require('../../config/redis');
const logger = require('../../../utils/logger');

class RealtimeDataService {
  constructor() {
    // Active data streams
    this.streams = new Map();

    // Refresh intervals
    this.intervals = new Map();

    // Prefetch cache
    this.prefetchCache = new Map();

    // Pagination state
    this.paginationState = new Map();

    // Default configuration
    this.defaults = {
      refreshInterval: 5000,      // 5 seconds
      prefetchEnabled: true,
      prefetchAhead: 2,           // Prefetch 2 pages ahead
      cacheEnabled: true,
      cacheTTL: 60,              // 60 seconds
      pageSize: 50,
      maxRetries: 3,
      retryDelay: 1000           // 1 second
    };
  }

  /**
   * Create a real-time data stream
   */
  async createStream(streamId, config) {
    const stream = {
      id: streamId,
      config: {
        ...this.defaults,
        ...config
      },
      status: 'active',
      currentPage: 1,
      totalPages: null,
      lastUpdate: null,
      lastFetch: null,
      subscribers: new Set(),
      dataProvider: config.dataProvider, // Function that fetches data
      createdAt: new Date().toISOString()
    };

    this.streams.set(streamId, stream);

    // Start refresh cycle
    if (stream.config.refreshInterval > 0) {
      await this.startRefreshCycle(streamId);
    }

    logger.info('Created real-time data stream', {
      streamId,
      refreshInterval: stream.config.refreshInterval,
      prefetchEnabled: stream.config.prefetchEnabled
    });

    return stream;
  }

  /**
   * Start refresh cycle for stream
   */
  async startRefreshCycle(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Clear existing interval
    if (this.intervals.has(streamId)) {
      clearInterval(this.intervals.get(streamId));
    }

    // Fetch initial data
    await this.fetchData(streamId, stream.currentPage);

    // Set up interval
    const intervalId = setInterval(async () => {
      try {
        await this.refreshStream(streamId);
      } catch (err) {
        logger.error('Stream refresh failed', { streamId, error: err.message });
      }
    }, stream.config.refreshInterval);

    this.intervals.set(streamId, intervalId);

    logger.debug('Started refresh cycle', { streamId, interval: stream.config.refreshInterval });
  }

  /**
   * Refresh stream data
   */
  async refreshStream(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    logger.debug('Refreshing stream', { streamId, page: stream.currentPage });

    // Fetch current page
    const data = await this.fetchData(streamId, stream.currentPage);

    // Update stream state
    stream.lastUpdate = new Date().toISOString();

    // Notify subscribers
    this.notifySubscribers(streamId, {
      type: 'data_update',
      data,
      page: stream.currentPage,
      timestamp: stream.lastUpdate
    });

    // Prefetch ahead if enabled
    if (stream.config.prefetchEnabled) {
      await this.prefetchPages(streamId);
    }

    return data;
  }

  /**
   * Fetch data for specific page
   */
  async fetchData(streamId, page, retries = 0) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    try {
      // Check cache first
      if (stream.config.cacheEnabled) {
        const cached = await this.getCachedData(streamId, page);
        if (cached) {
          logger.debug('Using cached data', { streamId, page });
          return cached;
        }
      }

      // Fetch from data provider
      const startTime = Date.now();

      const result = await stream.dataProvider({
        page,
        pageSize: stream.config.pageSize,
        streamId
      });

      const fetchTime = Date.now() - startTime;

      logger.debug('Fetched data', {
        streamId,
        page,
        rowCount: result.data?.length || 0,
        fetchTime: `${fetchTime}ms`
      });

      // Update pagination state
      if (result.totalPages) {
        stream.totalPages = result.totalPages;
      }

      stream.lastFetch = new Date().toISOString();

      // Cache result
      if (stream.config.cacheEnabled) {
        await this.cacheData(streamId, page, result);
      }

      return result;
    } catch (err) {
      logger.error('Data fetch failed', {
        streamId,
        page,
        error: err.message,
        retries
      });

      // Retry logic
      if (retries < stream.config.maxRetries) {
        await this.delay(stream.config.retryDelay * (retries + 1));
        return await this.fetchData(streamId, page, retries + 1);
      }

      throw err;
    }
  }

  /**
   * Prefetch pages ahead
   */
  async prefetchPages(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      return;
    }

    const { currentPage, totalPages, config } = stream;
    const { prefetchAhead } = config;

    // Don't prefetch if we don't know total pages yet
    if (totalPages === null) {
      return;
    }

    // Calculate pages to prefetch
    const pagesToPrefetch = [];
    for (let i = 1; i <= prefetchAhead; i++) {
      const nextPage = currentPage + i;
      if (nextPage <= totalPages) {
        pagesToPrefetch.push(nextPage);
      }
    }

    // Prefetch in background
    for (const page of pagesToPrefetch) {
      // Check if already cached
      const cacheKey = this.getCacheKey(streamId, page);
      if (this.prefetchCache.has(cacheKey)) {
        continue;
      }

      // Prefetch (non-blocking)
      this.fetchData(streamId, page).catch(err => {
        logger.warn('Prefetch failed', { streamId, page, error: err.message });
      });
    }

    logger.debug('Prefetched pages', { streamId, pages: pagesToPrefetch });
  }

  /**
   * Navigate to page
   */
  async goToPage(streamId, page) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    if (page < 1) {
      throw new Error('Page must be >= 1');
    }

    if (stream.totalPages !== null && page > stream.totalPages) {
      throw new Error(`Page ${page} exceeds total pages ${stream.totalPages}`);
    }

    logger.info('Navigating to page', { streamId, fromPage: stream.currentPage, toPage: page });

    // Update current page
    stream.currentPage = page;

    // Fetch data for new page
    const data = await this.fetchData(streamId, page);

    // Notify subscribers
    this.notifySubscribers(streamId, {
      type: 'page_change',
      data,
      page,
      timestamp: new Date().toISOString()
    });

    // Prefetch ahead
    if (stream.config.prefetchEnabled) {
      await this.prefetchPages(streamId);
    }

    return data;
  }

  /**
   * Go to next page
   */
  async nextPage(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const nextPage = stream.currentPage + 1;

    if (stream.totalPages !== null && nextPage > stream.totalPages) {
      throw new Error('Already at last page');
    }

    return await this.goToPage(streamId, nextPage);
  }

  /**
   * Go to previous page
   */
  async previousPage(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const prevPage = stream.currentPage - 1;

    if (prevPage < 1) {
      throw new Error('Already at first page');
    }

    return await this.goToPage(streamId, prevPage);
  }

  /**
   * Subscribe to stream updates
   */
  subscribe(streamId, callback) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const subscriber = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callback,
      subscribedAt: new Date().toISOString()
    };

    stream.subscribers.add(subscriber);

    logger.debug('Added subscriber', { streamId, subscriberId: subscriber.id });

    // Return unsubscribe function
    return () => {
      stream.subscribers.delete(subscriber);
      logger.debug('Removed subscriber', { streamId, subscriberId: subscriber.id });
    };
  }

  /**
   * Notify subscribers of updates
   */
  notifySubscribers(streamId, event) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      return;
    }

    for (const subscriber of stream.subscribers) {
      try {
        subscriber.callback(event);
      } catch (err) {
        logger.error('Subscriber callback failed', {
          streamId,
          subscriberId: subscriber.id,
          error: err.message
        });
      }
    }
  }

  /**
   * Pause stream
   */
  pauseStream(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Clear interval
    if (this.intervals.has(streamId)) {
      clearInterval(this.intervals.get(streamId));
      this.intervals.delete(streamId);
    }

    stream.status = 'paused';

    logger.info('Paused stream', { streamId });

    return { success: true };
  }

  /**
   * Resume stream
   */
  async resumeStream(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    if (stream.status !== 'paused') {
      throw new Error('Stream is not paused');
    }

    stream.status = 'active';

    // Restart refresh cycle
    await this.startRefreshCycle(streamId);

    logger.info('Resumed stream', { streamId });

    return { success: true };
  }

  /**
   * Stop and destroy stream
   */
  stopStream(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Clear interval
    if (this.intervals.has(streamId)) {
      clearInterval(this.intervals.get(streamId));
      this.intervals.delete(streamId);
    }

    // Clear caches
    this.clearStreamCache(streamId);

    // Remove stream
    this.streams.delete(streamId);

    logger.info('Stopped and destroyed stream', { streamId });

    return { success: true };
  }

  /**
   * Get stream info
   */
  getStreamInfo(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    return {
      id: stream.id,
      status: stream.status,
      currentPage: stream.currentPage,
      totalPages: stream.totalPages,
      subscriberCount: stream.subscribers.size,
      lastUpdate: stream.lastUpdate,
      lastFetch: stream.lastFetch,
      config: {
        refreshInterval: stream.config.refreshInterval,
        prefetchEnabled: stream.config.prefetchEnabled,
        cacheEnabled: stream.config.cacheEnabled,
        pageSize: stream.config.pageSize
      },
      createdAt: stream.createdAt
    };
  }

  /**
   * List all active streams
   */
  listStreams() {
    return Array.from(this.streams.keys()).map(streamId => this.getStreamInfo(streamId));
  }

  /**
   * Cache data
   */
  async cacheData(streamId, page, data) {
    const cacheKey = this.getCacheKey(streamId, page);

    try {
      if (redis.enabled) {
        // Store in Redis
        const stream = this.streams.get(streamId);
        await redis.setex(
          cacheKey,
          stream.config.cacheTTL,
          JSON.stringify(data)
        );
      } else {
        // Store in memory
        this.prefetchCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + (this.streams.get(streamId).config.cacheTTL * 1000)
        });
      }

      logger.debug('Cached data', { streamId, page });
    } catch (err) {
      logger.warn('Failed to cache data', { streamId, page, error: err.message });
    }
  }

  /**
   * Get cached data
   */
  async getCachedData(streamId, page) {
    const cacheKey = this.getCacheKey(streamId, page);

    try {
      if (redis.enabled) {
        // Get from Redis
        const cached = await redis.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
      } else {
        // Get from memory
        const cached = this.prefetchCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now()) {
          return cached.data;
        }

        // Remove expired
        if (cached) {
          this.prefetchCache.delete(cacheKey);
        }

        return null;
      }
    } catch (err) {
      logger.warn('Failed to get cached data', { streamId, page, error: err.message });
      return null;
    }
  }

  /**
   * Clear stream cache
   */
  clearStreamCache(streamId) {
    // Clear memory cache
    for (const key of this.prefetchCache.keys()) {
      if (key.startsWith(`stream:${streamId}:`)) {
        this.prefetchCache.delete(key);
      }
    }

    // Clear Redis cache (if enabled)
    if (redis.enabled) {
      redis.keys(`stream:${streamId}:*`).then(keys => {
        if (keys.length > 0) {
          redis.del(...keys);
        }
      }).catch(err => {
        logger.warn('Failed to clear Redis cache', { streamId, error: err.message });
      });
    }

    logger.debug('Cleared stream cache', { streamId });
  }

  /**
   * Get cache key
   */
  getCacheKey(streamId, page) {
    return `stream:${streamId}:page:${page}`;
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update stream configuration
   */
  updateStreamConfig(streamId, updates) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Update config
    stream.config = {
      ...stream.config,
      ...updates
    };

    // Restart if interval changed
    if (updates.refreshInterval !== undefined && stream.status === 'active') {
      this.startRefreshCycle(streamId);
    }

    logger.info('Updated stream config', { streamId, updates });

    return stream.config;
  }

  /**
   * Get stream statistics
   */
  getStreamStats(streamId) {
    const stream = this.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Calculate uptime
    const createdAt = new Date(stream.createdAt);
    const uptime = Date.now() - createdAt.getTime();

    // Count cached pages
    let cachedPages = 0;
    for (const key of this.prefetchCache.keys()) {
      if (key.startsWith(`stream:${streamId}:`)) {
        cachedPages++;
      }
    }

    return {
      streamId,
      status: stream.status,
      uptime: Math.floor(uptime / 1000), // seconds
      subscriberCount: stream.subscribers.size,
      currentPage: stream.currentPage,
      totalPages: stream.totalPages,
      cachedPages,
      lastUpdate: stream.lastUpdate,
      lastFetch: stream.lastFetch
    };
  }
}

module.exports = new RealtimeDataService();
