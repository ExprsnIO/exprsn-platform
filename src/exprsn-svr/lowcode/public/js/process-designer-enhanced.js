/**
 * Process Designer - Enhanced BPMN 2.0 Visual Process Designer
 * Integrates with all Exprsn services (Workflow, CRM, Timeline, Auth, Spark, Herald, Bridge, Nexus, FileVault, Payments)
 *
 * Enhancement: Comprehensive service-specific properties for all Exprsn microservices
 */

// This file extends the base ProcessDesigner class with enhanced property handling

class EnhancedPropertyManager {
  /**
   * Get service-specific default properties
   */
  static getServiceDefaultProperties(type) {
    const serviceProps = {
      // Timeline Service
      'timeline-post': {
        content: '',
        visibility: 'public',
        attachments: [],
        mentionsEnabled: true,
        hashtagsEnabled: true
      },
      'timeline-comment': {
        postId: '',
        content: '',
        parentCommentId: null
      },
      'timeline-like': {
        postId: '',
        reactionType: 'like'
      },

      // Auth Service
      'auth-login': {
        username: '',
        password: '',
        mfaEnabled: false,
        rememberMe: false,
        sessionDuration: 3600
      },
      'auth-register': {
        username: '',
        email: '',
        password: '',
        requireEmailVerification: true,
        autoLogin: false,
        defaultRole: 'user'
      },
      'auth-mfa': {
        method: 'totp', // totp, sms, email
        challengeTimeout: 300
      },
      'auth-permission': {
        resource: '',
        action: 'read',
        throwOnDeny: false
      },

      // Spark Messaging
      'spark-message': {
        recipientId: '',
        message: '',
        encrypted: true,
        attachments: [],
        priority: 'normal'
      },
      'spark-broadcast': {
        groupId: '',
        message: '',
        encrypted: true,
        excludeUsers: []
      },

      // Herald Notifications
      'herald-email': {
        to: '',
        subject: '',
        body: '',
        from: null,
        template: null,
        variables: {}
      },
      'herald-sms': {
        to: '',
        message: '',
        provider: 'twilio'
      },
      'herald-push': {
        userId: '',
        title: '',
        body: '',
        data: {},
        badge: null,
        sound: 'default'
      },

      // Bridge API Gateway
      'bridge-api': {
        method: 'GET',
        url: '',
        headers: {},
        body: null,
        timeout: 30000,
        retryCount: 3,
        rateLimitKey: null
      },
      'bridge-webhook': {
        endpoint: '',
        secret: '',
        events: []
      },

      // Nexus Groups & Events
      'nexus-group': {
        operation: 'create', // create, update, delete, addMember, removeMember
        groupId: null,
        name: '',
        description: '',
        privacy: 'public',
        userId: null
      },
      'nexus-event': {
        operation: 'create',
        title: '',
        description: '',
        startDate: null,
        endDate: null,
        location: '',
        groupId: null
      },

      // FileVault Storage
      'filevault-upload': {
        file: null,
        folder: '/',
        overwrite: false,
        encryption: true,
        maxSize: 10485760, // 10MB
        allowedTypes: []
      },
      'filevault-download': {
        fileId: '',
        version: 'latest',
        generateUrl: false,
        expiresIn: 3600
      },

      // Payments
      'payment-charge': {
        amount: 0,
        currency: 'USD',
        customerId: '',
        description: '',
        provider: 'stripe', // stripe, paypal, authorize
        captureNow: true,
        metadata: {}
      },
      'payment-refund': {
        paymentId: '',
        amount: null, // null = full refund
        reason: '',
        notifyCustomer: true
      }
    };

    return serviceProps[type] || {};
  }

  /**
   * Render Integration properties for service-specific tasks
   */
  static renderServiceIntegrationProperties(element, container) {
    const type = element.type;

    switch (type) {
      case 'timeline-post':
        return this.renderTimelinePostProperties(element, container);
      case 'timeline-comment':
        return this.renderTimelineCommentProperties(element, container);
      case 'timeline-like':
        return this.renderTimelineLikeProperties(element, container);

      case 'auth-login':
        return this.renderAuthLoginProperties(element, container);
      case 'auth-register':
        return this.renderAuthRegisterProperties(element, container);
      case 'auth-mfa':
        return this.renderAuthMFAProperties(element, container);
      case 'auth-permission':
        return this.renderAuthPermissionProperties(element, container);

      case 'spark-message':
        return this.renderSparkMessageProperties(element, container);
      case 'spark-broadcast':
        return this.renderSparkBroadcastProperties(element, container);

      case 'herald-email':
        return this.renderHeraldEmailProperties(element, container);
      case 'herald-sms':
        return this.renderHeraldSMSProperties(element, container);
      case 'herald-push':
        return this.renderHeraldPushProperties(element, container);

      case 'bridge-api':
        return this.renderBridgeAPIProperties(element, container);
      case 'bridge-webhook':
        return this.renderBridgeWebhookProperties(element, container);

      case 'nexus-group':
        return this.renderNexusGroupProperties(element, container);
      case 'nexus-event':
        return this.renderNexusEventProperties(element, container);

      case 'filevault-upload':
        return this.renderFileVaultUploadProperties(element, container);
      case 'filevault-download':
        return this.renderFileVaultDownloadProperties(element, container);

      case 'payment-charge':
        return this.renderPaymentChargeProperties(element, container);
      case 'payment-refund':
        return this.renderPaymentRefundProperties(element, container);

      default:
        return `
          <div class="empty-state">
            <i class="fas fa-puzzle-piece"></i>
            <p>This element type does not have integration options</p>
          </div>
        `;
    }
  }

  // Timeline Post Properties
  static renderTimelinePostProperties(element, container) {
    const props = element.properties;
    return `
      <div class="property-group">
        <div class="property-group-title">Timeline Post Configuration</div>

        <div class="property-field">
          <label class="property-label">Post Content</label>
          <textarea class="property-textarea" id="prop-content" placeholder="Post message">${props.content || ''}</textarea>
        </div>

        <div class="property-field">
          <label class="property-label">Visibility</label>
          <select class="property-select" id="prop-visibility">
            <option value="public" ${props.visibility === 'public' ? 'selected' : ''}>Public</option>
            <option value="followers" ${props.visibility === 'followers' ? 'selected' : ''}>Followers</option>
            <option value="private" ${props.visibility === 'private' ? 'selected' : ''}>Private</option>
          </select>
        </div>

        <div class="property-field">
          <label class="property-label">
            <input type="checkbox" id="prop-mentionsEnabled" ${props.mentionsEnabled ? 'checked' : ''}> Enable Mentions
          </label>
        </div>

        <div class="property-field">
          <label class="property-label">
            <input type="checkbox" id="prop-hashtagsEnabled" ${props.hashtagsEnabled ? 'checked' : ''}> Enable Hashtags
          </label>
        </div>
      </div>
    `;
  }

  // Timeline Comment Properties
  static renderTimelineCommentProperties(element, container) {
    const props = element.properties;
    return `
      <div class="property-group">
        <div class="property-group-title">Timeline Comment Configuration</div>

        <div class="property-field">
          <label class="property-label">Post ID</label>
          <input type="text" class="property-input" id="prop-postId" value="${props.postId || ''}" placeholder="\${postId}">
          <div class="property-hint">Post to comment on</div>
        </div>

        <div class="property-field">
          <label class="property-label">Comment Content</label>
          <textarea class="property-textarea" id="prop-content" placeholder="Comment text">${props.content || ''}</textarea>
        </div>

        <div class="property-field">
          <label class="property-label">Parent Comment ID (Optional)</label>
          <input type="text" class="property-input" id="prop-parentCommentId" value="${props.parentCommentId || ''}" placeholder="For nested replies">
        </div>
      </div>
    `;
  }

  // Auth Login Properties
  static renderAuthLoginProperties(element, container) {
    const props = element.properties;
    return `
      <div class="property-group">
        <div class="property-group-title">Authentication Configuration</div>

        <div class="property-field">
          <label class="property-label">Username/Email</label>
          <input type="text" class="property-input" id="prop-username" value="${props.username || ''}" placeholder="\${username}">
        </div>

        <div class="property-field">
          <label class="property-label">Password</label>
          <input type="text" class="property-input" id="prop-password" value="${props.password || ''}" placeholder="\${password}">
        </div>

        <div class="property-field">
          <label class="property-label">Session Duration (seconds)</label>
          <input type="number" class="property-input" id="prop-sessionDuration" value="${props.sessionDuration || 3600}">
        </div>

        <div class="property-field">
          <label class="property-label">
            <input type="checkbox" id="prop-mfaEnabled" ${props.mfaEnabled ? 'checked' : ''}> Require MFA
          </label>
        </div>

        <div class="property-field">
          <label class="property-label">
            <input type="checkbox" id="prop-rememberMe" ${props.rememberMe ? 'checked' : ''}> Remember Me
          </label>
        </div>
      </div>
    `;
  }

  // Herald Email Properties
  static renderHeraldEmailProperties(element, container) {
    const props = element.properties;
    return `
      <div class="property-group">
        <div class="property-group-title">Email Configuration</div>

        <div class="property-field">
          <label class="property-label">To (Email Address)</label>
          <input type="text" class="property-input" id="prop-to" value="${props.to || ''}" placeholder="user@example.com or \${email}">
        </div>

        <div class="property-field">
          <label class="property-label">Subject</label>
          <input type="text" class="property-input" id="prop-subject" value="${props.subject || ''}" placeholder="Email subject">
        </div>

        <div class="property-field">
          <label class="property-label">Body</label>
          <textarea class="property-textarea" id="prop-body" rows="6" placeholder="Email message">${props.body || ''}</textarea>
        </div>

        <div class="property-field">
          <label class="property-label">Template (Optional)</label>
          <input type="text" class="property-input" id="prop-template" value="${props.template || ''}" placeholder="welcome-email">
          <div class="property-hint">Leave blank to use body content</div>
        </div>
      </div>
    `;
  }

  // Bridge API Properties
  static renderBridgeAPIProperties(element, container) {
    const props = element.properties;
    return `
      <div class="property-group">
        <div class="property-group-title">API Configuration</div>

        <div class="property-field">
          <label class="property-label">HTTP Method</label>
          <select class="property-select" id="prop-method">
            <option value="GET" ${props.method === 'GET' ? 'selected' : ''}>GET</option>
            <option value="POST" ${props.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="PUT" ${props.method === 'PUT' ? 'selected' : ''}>PUT</option>
            <option value="PATCH" ${props.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
            <option value="DELETE" ${props.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
          </select>
        </div>

        <div class="property-field">
          <label class="property-label">URL</label>
          <input type="text" class="property-input" id="prop-url" value="${props.url || ''}" placeholder="https://api.example.com/resource">
        </div>

        <div class="property-field">
          <label class="property-label">Headers (JSON)</label>
          <textarea class="property-textarea" id="prop-headers" rows="4" placeholder='{"Authorization": "Bearer ${token}"}'>${JSON.stringify(props.headers || {}, null, 2)}</textarea>
        </div>

        <div class="property-field">
          <label class="property-label">Request Body (JSON)</label>
          <textarea class="property-textarea" id="prop-body" rows="6" placeholder='{"key": "${value}"}'>${props.body ? JSON.stringify(props.body, null, 2) : ''}</textarea>
        </div>

        <div class="property-field">
          <label class="property-label">Timeout (ms)</label>
          <input type="number" class="property-input" id="prop-timeout" value="${props.timeout || 30000}">
        </div>

        <div class="property-field">
          <label class="property-label">Retry Count</label>
          <input type="number" class="property-input" id="prop-retryCount" value="${props.retryCount || 3}" min="0" max="10">
        </div>
      </div>
    `;
  }

  // Payment Charge Properties
  static renderPaymentChargeProperties(element, container) {
    const props = element.properties;
    return `
      <div class="property-group">
        <div class="property-group-title">Payment Configuration</div>

        <div class="property-field">
          <label class="property-label">Amount</label>
          <input type="number" class="property-input" id="prop-amount" value="${props.amount || 0}" step="0.01" min="0">
        </div>

        <div class="property-field">
          <label class="property-label">Currency</label>
          <select class="property-select" id="prop-currency">
            <option value="USD" ${props.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="EUR" ${props.currency === 'EUR' ? 'selected' : ''}>EUR</option>
            <option value="GBP" ${props.currency === 'GBP' ? 'selected' : ''}>GBP</option>
            <option value="CAD" ${props.currency === 'CAD' ? 'selected' : ''}>CAD</option>
          </select>
        </div>

        <div class="property-field">
          <label class="property-label">Customer ID</label>
          <input type="text" class="property-input" id="prop-customerId" value="${props.customerId || ''}" placeholder="\${customerId}">
        </div>

        <div class="property-field">
          <label class="property-label">Description</label>
          <input type="text" class="property-input" id="prop-description" value="${props.description || ''}" placeholder="Payment for...">
        </div>

        <div class="property-field">
          <label class="property-label">Payment Provider</label>
          <select class="property-select" id="prop-provider">
            <option value="stripe" ${props.provider === 'stripe' ? 'selected' : ''}>Stripe</option>
            <option value="paypal" ${props.provider === 'paypal' ? 'selected' : ''}>PayPal</option>
            <option value="authorize" ${props.provider === 'authorize' ? 'selected' : ''}>Authorize.Net</option>
          </select>
        </div>

        <div class="property-field">
          <label class="property-label">
            <input type="checkbox" id="prop-captureNow" ${props.captureNow ? 'checked' : ''}> Capture Immediately
          </label>
        </div>
      </div>
    `;
  }

  // Stub methods for other services (can be expanded similarly)
  static renderTimelineLikeProperties(element, container) {
    const props = element.properties;
    return `<div class="property-group"><div class="property-group-title">Timeline Like Configuration</div>
      <div class="property-field"><label class="property-label">Post ID</label>
      <input type="text" class="property-input" id="prop-postId" value="${props.postId || ''}" placeholder="\${postId}"></div>
      <div class="property-field"><label class="property-label">Reaction Type</label>
      <select class="property-select" id="prop-reactionType">
        <option value="like" ${props.reactionType === 'like' ? 'selected' : ''}>Like</option>
        <option value="love" ${props.reactionType === 'love' ? 'selected' : ''}>Love</option>
        <option value="haha" ${props.reactionType === 'haha' ? 'selected' : ''}>Haha</option>
      </select></div></div>`;
  }

  static renderAuthRegisterProperties(element, container) { return `<div class="property-group"><div class="property-group-title">User Registration</div><div class="property-field"><label>Username</label><input type="text" class="property-input" id="prop-username" value="${element.properties.username || ''}" placeholder="\${username}"></div><div class="property-field"><label>Email</label><input type="text" class="property-input" id="prop-email" value="${element.properties.email || ''}" placeholder="\${email}"></div><div class="property-field"><label>Default Role</label><input type="text" class="property-input" id="prop-defaultRole" value="${element.properties.defaultRole || 'user'}"></div></div>`; }
  static renderAuthMFAProperties(element, container) { return `<div class="property-group"><div class="property-group-title">MFA Configuration</div><div class="property-field"><label>Method</label><select class="property-select" id="prop-method"><option value="totp" ${element.properties.method === 'totp' ? 'selected' : ''}>TOTP</option><option value="sms">SMS</option><option value="email">Email</option></select></div></div>`; }
  static renderAuthPermissionProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Permission Check</div><div class="property-field"><label>Resource</label><input type="text" class="property-input" id="prop-resource" value="${element.properties.resource || ''}"></div><div class="property-field"><label>Action</label><select class="property-select" id="prop-action"><option value="read" ${element.properties.action === 'read' ? 'selected' : ''}>Read</option><option value="write">Write</option><option value="delete">Delete</option></select></div></div>`; }
  static renderSparkMessageProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Direct Message</div><div class="property-field"><label>Recipient ID</label><input type="text" class="property-input" id="prop-recipientId" value="${element.properties.recipientId || ''}" placeholder="\${userId}"></div><div class="property-field"><label>Message</label><textarea class="property-textarea" id="prop-message">${element.properties.message || ''}</textarea></div></div>`; }
  static renderSparkBroadcastProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Broadcast Message</div><div class="property-field"><label>Group ID</label><input type="text" class="property-input" id="prop-groupId" value="${element.properties.groupId || ''}"></div><div class="property-field"><label>Message</label><textarea class="property-textarea" id="prop-message">${element.properties.message || ''}</textarea></div></div>`; }
  static renderHeraldSMSProperties(element, container) { return `<div class="property-group"><div class="property-group-title">SMS Configuration</div><div class="property-field"><label>To (Phone Number)</label><input type="text" class="property-input" id="prop-to" value="${element.properties.to || ''}" placeholder="+1234567890"></div><div class="property-field"><label>Message</label><textarea class="property-textarea" id="prop-message">${element.properties.message || ''}</textarea></div></div>`; }
  static renderHeraldPushProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Push Notification</div><div class="property-field"><label>User ID</label><input type="text" class="property-input" id="prop-userId" value="${element.properties.userId || ''}"></div><div class="property-field"><label>Title</label><input type="text" class="property-input" id="prop-title" value="${element.properties.title || ''}"></div><div class="property-field"><label>Body</label><textarea class="property-textarea" id="prop-body">${element.properties.body || ''}</textarea></div></div>`; }
  static renderBridgeWebhookProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Webhook Configuration</div><div class="property-field"><label>Endpoint</label><input type="text" class="property-input" id="prop-endpoint" value="${element.properties.endpoint || ''}"></div><div class="property-field"><label>Secret</label><input type="text" class="property-input" id="prop-secret" value="${element.properties.secret || ''}"></div></div>`; }
  static renderNexusGroupProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Group Management</div><div class="property-field"><label>Operation</label><select class="property-select" id="prop-operation"><option value="create" ${element.properties.operation === 'create' ? 'selected' : ''}>Create</option><option value="update">Update</option><option value="delete">Delete</option><option value="addMember">Add Member</option></select></div><div class="property-field"><label>Group Name</label><input type="text" class="property-input" id="prop-name" value="${element.properties.name || ''}"></div></div>`; }
  static renderNexusEventProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Event Configuration</div><div class="property-field"><label>Title</label><input type="text" class="property-input" id="prop-title" value="${element.properties.title || ''}"></div><div class="property-field"><label>Start Date</label><input type="datetime-local" class="property-input" id="prop-startDate" value="${element.properties.startDate || ''}"></div></div>`; }
  static renderFileVaultUploadProperties(element, container) { return `<div class="property-group"><div class="property-group-title">File Upload</div><div class="property-field"><label>Folder Path</label><input type="text" class="property-input" id="prop-folder" value="${element.properties.folder || '/'}"></div><div class="property-field"><label>Max Size (bytes)</label><input type="number" class="property-input" id="prop-maxSize" value="${element.properties.maxSize || 10485760}"></div></div>`; }
  static renderFileVaultDownloadProperties(element, container) { return `<div class="property-group"><div class="property-group-title">File Download</div><div class="property-field"><label>File ID</label><input type="text" class="property-input" id="prop-fileId" value="${element.properties.fileId || ''}"></div><div class="property-field"><label>Version</label><input type="text" class="property-input" id="prop-version" value="${element.properties.version || 'latest'}"></div></div>`; }
  static renderPaymentRefundProperties(element, container) { return `<div class="property-group"><div class="property-group-title">Refund Configuration</div><div class="property-field"><label>Payment ID</label><input type="text" class="property-input" id="prop-paymentId" value="${element.properties.paymentId || ''}"></div><div class="property-field"><label>Amount (leave blank for full refund)</label><input type="number" class="property-input" id="prop-amount" value="${element.properties.amount || ''}" step="0.01"></div><div class="property-field"><label>Reason</label><input type="text" class="property-input" id="prop-reason" value="${element.properties.reason || ''}"></div></div>`; }
}

// Export for use in main ProcessDesigner class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnhancedPropertyManager;
} else {
  window.EnhancedPropertyManager = EnhancedPropertyManager;
}
