/**
 * Operating System Detection Utility
 * Detects OS platform, distribution, version, and package manager
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Execute command and return output
 */
function exec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Detect Linux distribution
 */
function detectLinuxDistro() {
  // Try /etc/os-release (modern standard)
  if (fs.existsSync('/etc/os-release')) {
    const content = fs.readFileSync('/etc/os-release', 'utf8');
    const lines = content.split('\n');
    const info = {};
    
    lines.forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        info[key] = value.replace(/"/g, '');
      }
    });
    
    return {
      name: info.NAME || info.ID || 'Unknown',
      id: info.ID || 'unknown',
      version: info.VERSION_ID || info.VERSION || 'unknown',
      versionName: info.VERSION || 'unknown',
      prettyName: info.PRETTY_NAME || 'Unknown Linux'
    };
  }
  
  // Fallback to legacy methods
  if (fs.existsSync('/etc/redhat-release')) {
    const content = fs.readFileSync('/etc/redhat-release', 'utf8').trim();
    return {
      name: 'Red Hat',
      id: 'rhel',
      version: content.match(/\d+\.\d+/)?.[0] || 'unknown',
      versionName: content,
      prettyName: content
    };
  }
  
  if (fs.existsSync('/etc/debian_version')) {
    const version = fs.readFileSync('/etc/debian_version', 'utf8').trim();
    return {
      name: 'Debian',
      id: 'debian',
      version: version,
      versionName: version,
      prettyName: 'Debian ' + version
    };
  }
  
  return {
    name: 'Linux',
    id: 'linux',
    version: 'unknown',
    versionName: 'unknown',
    prettyName: 'Linux'
  };
}

/**
 * Detect package manager
 */
function detectPackageManager(distroId) {
  const managers = [
    { name: 'brew', command: 'brew --version', platforms: ['darwin'] },
    { name: 'apt', command: 'apt --version', platforms: ['ubuntu', 'debian', 'linuxmint', 'pop', 'elementary'] },
    { name: 'dnf', command: 'dnf --version', platforms: ['fedora', 'rhel', 'centos', 'rocky', 'alma'] },
    { name: 'yum', command: 'yum --version', platforms: ['centos', 'rhel', 'amazon', 'oracle'] },
    { name: 'pacman', command: 'pacman --version', platforms: ['arch', 'manjaro', 'endeavouros'] },
    { name: 'zypper', command: 'zypper --version', platforms: ['opensuse', 'suse'] },
    { name: 'apk', command: 'apk --version', platforms: ['alpine'] }
  ];
  
  for (const manager of managers) {
    if (manager.platforms.includes(distroId) || manager.platforms.includes(os.platform())) {
      if (exec(manager.command)) {
        return manager.name;
      }
    }
  }
  
  // Fallback: check all managers
  for (const manager of managers) {
    if (exec(manager.command)) {
      return manager.name;
    }
  }
  
  return null;
}

/**
 * Get macOS version name
 */
function getMacOSName(version) {
  const major = parseInt(version.split('.')[0]);
  const names = {
    14: 'Sonoma',
    13: 'Ventura',
    12: 'Monterey',
    11: 'Big Sur',
    10: 'Catalina'
  };
  return names[major] || 'macOS';
}

/**
 * Main OS detection function
 */
async function detectOS() {
  const platform = os.platform();
  const release = os.release();
  
  let osInfo = {
    platform,
    release,
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024))
  };
  
  if (platform === 'darwin') {
    const version = exec('sw_vers -productVersion');
    osInfo = Object.assign({}, osInfo, {
      name: 'macOS',
      id: 'macos',
      version: version || release,
      versionName: getMacOSName(version || release),
      prettyName: 'macOS ' + getMacOSName(version || release) + ' ' + (version || release),
      packageManager: 'brew'
    });
  } else if (platform === 'linux') {
    const distro = detectLinuxDistro();
    osInfo = Object.assign({}, osInfo, distro, {
      packageManager: detectPackageManager(distro.id)
    });
  } else if (platform === 'win32') {
    osInfo = Object.assign({}, osInfo, {
      name: 'Windows',
      id: 'windows',
      version: release,
      versionName: 'Windows',
      prettyName: 'Windows ' + release,
      packageManager: 'choco'
    });
  } else {
    osInfo = Object.assign({}, osInfo, {
      name: 'Unknown',
      id: 'unknown',
      version: release,
      versionName: 'Unknown',
      prettyName: platform + ' ' + release,
      packageManager: null
    });
  }
  
  return osInfo;
}

/**
 * Check if running as root/sudo
 */
function isRoot() {
  return process.getuid && process.getuid() === 0;
}

/**
 * Check if sudo is available
 */
function hasSudo() {
  return exec('which sudo') !== null;
}

module.exports = {
  detectOS,
  isRoot,
  hasSudo,
  exec
};
