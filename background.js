// 1Password Extension - Manifest V3 Service Worker
// This service worker handles the core background functionality

// Variables to track the current fill operation
let currentTabId = null;

// Initialize the extension when the service worker starts
try {
  chrome.runtime.onStartup.addListener(() => {
    console.log('1Password extension starting up...');
    initializeExtension();
  });
} catch (error) {
  console.log('Error setting up onStartup listener:', error);
}

try {
  chrome.runtime.onInstalled.addListener(() => {
    console.log('1Password extension installed...');
    initializeExtension();
  });
} catch (error) {
  console.log('Error setting up onInstalled listener:', error);
}

// Also initialize immediately in case the service worker is already running
try {
  console.log('1Password extension service worker loaded...');
  initializeExtension();
} catch (error) {
  console.log('Error during immediate initialization:', error);
}

// Track if extension is already initialized
let isInitialized = false;

// Initialize extension functionality
function initializeExtension() {
  // Prevent multiple initializations
  if (isInitialized) {
    console.log('Extension already initialized, skipping...');
    return;
  }
  isInitialized = true;
  
  // Check if we're in a service worker context
  if (typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) {
    console.log('Running in service worker context');
  } else {
    console.log('Not in service worker context');
  }
  // Set up action click handler
  if (chrome.action && chrome.action.onClicked) {
    chrome.action.onClicked.addListener((tab) => {
      console.log('Action button clicked for tab:', tab.id);
      handleActionClick(tab);
    });
  }

  // Set up context menu
  if (chrome.contextMenus) {
    try {
      chrome.contextMenus.removeAll(() => {
        // Check for chrome.runtime.lastError to handle any errors from removeAll
        if (chrome.runtime.lastError) {
          console.log('Error removing context menus:', chrome.runtime.lastError);
        }

        chrome.contextMenus.create({
          id: '1password-context-menu',
          title: '1Password',
          contexts: ['all']
        }, () => {
          // Check for errors after creating the context menu
          if (chrome.runtime.lastError) {
            console.log('Error creating context menu:', chrome.runtime.lastError);
          } else {
            console.log('Context menu created successfully');
          }
        });
      });

      // Set up context menu click handler
      if (chrome.contextMenus.onClicked) {
        chrome.contextMenus.onClicked.addListener((info, tab) => {
          console.log('Context menu clicked');
          handleContextMenuClick(info);
        });
      }
    } catch (error) {
      console.log('Error setting up context menu:', error);
    }
  }

  // Set up tab update listener
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        handleTabComplete(tab);
      }
    });
  }

  // Set up message handling
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Message received:', message);
      if (message && message.command) {
        handleMessage(message, sender, sendResponse);
        return true; // Keep the message channel open for async response
      } else if (message && message.name) {
        // Handle messages with 'name' property (like toolbarButtonClicked)
        console.log('Message with name property received:', message.name);
        // Return false to indicate we're not sending an async response
        return false;
      }
    });
  }

  // Set up declarativeNetRequest debug listener (only available in debug mode)
  try {
    if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
      chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(
        function(info) {
          console.log('Rule matched for URL:', info.request.url);
          if (info.request.url.includes('onepasswdfill')) {
            handleOnePasswordFill(info);
          }
        }
      );
    }
  } catch (error) {
    console.log('DeclarativeNetRequest debug API not available:', error);
  }

  // Fallback: Set up webRequest listener for onepasswdfill URLs
  try {
    if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
      chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
          if (details.url.includes('onepasswdfill')) {
            console.log('onepasswdfill URL detected via webRequest:', details.url);
            handleOnePasswordFill({
              request: {
                url: details.url,
                tabId: details.tabId
              }
            });
          }
        },
        {urls: ['<all_urls>'], types: ['main_frame']},
        ['requestBody']
      );
    }
  } catch (error) {
    console.log('WebRequest onBeforeRequest API not available:', error);
  }

  // Set up webRequest listener
  try {
    if (chrome.webRequest && chrome.webRequest.onCompleted) {
      chrome.webRequest.onCompleted.addListener(
        function(details) {
          if (currentTabId && currentTabId === details.tabId) {
            console.log('Fill completion detected for tab:', details.tabId);
            handleFillCompletion(details);
          }
        },
        {types: ['main_frame'], urls: ['<all_urls>']}
      );
    }
  } catch (error) {
    console.log('WebRequest API not available:', error);
  }
}

// Handle onepasswdfill URL processing
function handleOnePasswordFill(info) {
  console.log('Processing onepasswdfill URL:', info.request.url);
  
  // Extract parameters from URL
  const url = new URL(info.request.url);
  const onepasswdfill = url.searchParams.get('onepasswdfill');
  const onepasswdvault = url.searchParams.get('onepasswdvault');
  
  if (onepasswdfill) {
    currentTabId = info.request.tabId;
    
    // Send message to content script to handle the fill
    try {
      if (chrome.tabs && chrome.tabs.sendMessage) {
        chrome.tabs.sendMessage(info.request.tabId, {
          name: 'handleOnePasswordFill',
          message: {
            onepasswdfill: onepasswdfill,
            onepasswdvault: onepasswdvault,
            url: info.request.url
          }
        }).catch(error => {
          console.log('Could not send message to tab:', error);
        });
      }
    } catch (error) {
      console.log('Error sending message to tab:', error);
    }
  }
}

// Handle fill completion
function handleFillCompletion(details) {
  console.log('Fill completion for tab:', details.tabId);
  currentTabId = null;
}

// Handle action click
function handleActionClick(tab) {
  console.log('Action button clicked for URL:', tab.url);
  if (tab && tab.url) {
    try {
      if (chrome.tabs && chrome.tabs.sendMessage) {
        chrome.tabs.sendMessage(tab.id, {
          name: 'toolbarButtonClicked',
          message: { url: tab.url }
        }).catch(error => {
          console.log('Could not send message to tab:', error);
        });
      }
    } catch (error) {
      console.log('Error sending message to tab:', error);
    }
  }
}

// Handle context menu click
function handleContextMenuClick(info) {
  console.log('Context menu clicked for URL:', info.pageUrl);
  if (info.pageUrl) {
    try {
      if (chrome.tabs && chrome.tabs.sendMessage) {
        chrome.tabs.sendMessage(info.tabId, {
          name: 'contextMenuClicked',
          message: { url: info.pageUrl }
        }).catch(error => {
          console.log('Could not send message to tab:', error);
        });
      }
    } catch (error) {
      console.log('Error sending message to tab:', error);
    }
  }
}

// Handle tab complete
function handleTabComplete(tab) {
  console.log('Tab completed loading:', tab.url);
  if (tab.url === 'https://agilebits.com/browsers/welcome.html') {
    try {
      if (chrome.tabs && chrome.tabs.sendMessage) {
        chrome.tabs.sendMessage(tab.id, {
          name: 'welcomePageLoaded',
          message: {}
        }).catch(error => {
          console.log('Could not send message to tab:', error);
        });
      }
    } catch (error) {
      console.log('Error sending message to tab:', error);
    }
  } else if (tab.url === 'https://agilebits.com/browsers/auth.html') {
    try {
      if (chrome.tabs && chrome.tabs.sendMessage) {
        chrome.tabs.sendMessage(tab.id, {
          name: 'authPageLoaded',
          message: {}
        }).catch(error => {
          console.log('Could not send message to tab:', error);
        });
      }
    } catch (error) {
      console.log('Error sending message to tab:', error);
    }
  }
}

// Handle messages from content scripts
function handleMessage(message, sender, sendResponse) {
  console.log('Handling message:', message.command);
  
  // Route messages to appropriate handlers
  switch (message.command) {
    case 'getPageDetails':
      handleGetPageDetails(message.params, sender, sendResponse);
      break;
    case 'autosave':
      handleAutosave(message.params, sender, sendResponse);
      break;
    case 'fillItem':
      handleFillItem(message.params, sender, sendResponse);
      break;
    case 'hello':
      handleHello(message.params, sender, sendResponse);
      break;
    default:
      console.warn('Unknown command:', message.command);
      sendResponse({ error: 'Unknown command' });
  }
}

// Message handlers
function handleGetPageDetails(params, sender, sendResponse) {
  console.log('Getting page details');
  // This would typically involve page analysis
  sendResponse({ success: true, pageDetails: {} });
}

function handleAutosave(params, sender, sendResponse) {
  console.log('Handling autosave');
  // This would typically involve saving login data
  sendResponse({ success: true });
}

function handleFillItem(params, sender, sendResponse) {
  console.log('Handling fill item');
  // This would typically involve filling form fields
  sendResponse({ success: true });
}

function handleHello(params, sender, sendResponse) {
  console.log('Handling hello message');
  sendResponse({ 
    success: true, 
    version: '4.7.5.90',
    capabilities: {
      declarativeNetRequest: true,
      serviceWorker: true
    }
  });
}

// Initialize when the service worker loads
console.log('1Password service worker loading...');
initializeExtension(); 