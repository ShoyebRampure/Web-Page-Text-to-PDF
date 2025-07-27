// Enhanced Background Script for PDF Converter Pro
// Version 2.1.0

const SERVER_URL = 'http://localhost:5000';
const CONVERT_ENDPOINT = '/convert'; // Updated to match server.js
const HEALTH_ENDPOINT = '/health';

// Store server status
let serverStatus = { online: false, lastChecked: null };

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log('PDF Converter Pro installed/updated:', details.reason);
  
  // Create context menus
  createContextMenus();
  
  // Check server status on install
  checkServerHealth();
  
  // Set up periodic health checks
  setupHealthChecks();
  
  // Show welcome notification for new installs
  if (details.reason === 'install') {
    showNotification(
      'PDF Converter Pro Installed!',
      'Right-click on any page to convert text to PDF',
      'success'
    );
  }
});

// Create enhanced context menus
function createContextMenus() {
  // Clear existing menus first
  chrome.contextMenus.removeAll(() => {
    // Main menu item
    chrome.contextMenus.create({
      id: "convertToPDF",
      title: "Convert to PDF",
      contexts: ["selection", "page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });

    // Submenu for different conversion types
    chrome.contextMenus.create({
      id: "convertSelection",
      parentId: "convertToPDF",
      title: "Convert selected text",
      contexts: ["selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });

    chrome.contextMenus.create({
      id: "convertFullPage",
      parentId: "convertToPDF",
      title: "Convert entire page",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });

    chrome.contextMenus.create({
      id: "convertVisibleText",
      parentId: "convertToPDF",
      title: "Convert visible content",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });

    // Separator
    chrome.contextMenus.create({
      id: "separator1",
      parentId: "convertToPDF",
      type: "separator",
      contexts: ["selection", "page"]
    });

    // Dashboard link
    chrome.contextMenus.create({
      id: "openDashboard",
      parentId: "convertToPDF",
      title: "📊 Open Dashboard",
      contexts: ["selection", "page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });

    console.log('Context menus created successfully');
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked:', info.menuItemId);

  // Check server health before proceeding
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    showNotification(
      'Server Offline',
      'PDF Converter server is not running. Please start the server.',
      'error'
    );
    return;
  }

  try {
    switch (info.menuItemId) {
      case 'convertSelection':
        await handleSelectionConversion(info, tab);
        break;
      case 'convertFullPage':
        await handleFullPageConversion(info, tab);
        break;
      case 'convertVisibleText':
        await handleVisibleContentConversion(info, tab);
        break;
      case 'convertToPDF':
        // Default behavior - convert selection if available, otherwise full page
        if (info.selectionText) {
          await handleSelectionConversion(info, tab);
        } else {
          await handleFullPageConversion(info, tab);
        }
        break;
      case 'openDashboard':
        chrome.tabs.create({ url: SERVER_URL });
        break;
    }
  } catch (error) {
    console.error('Error handling context menu action:', error);
    showNotification(
      'Conversion Failed',
      'An error occurred while converting to PDF',
      'error'
    );
  }
});

// Handle selected text conversion
async function handleSelectionConversion(info, tab) {
  const selectedText = info.selectionText;
  
  if (!selectedText || selectedText.trim().length === 0) {
    showNotification(
      'No Text Selected',
      'Please select some text to convert to PDF',
      'warning'
    );
    return;
  }

  showNotification(
    'Converting Selection...',
    'Creating PDF from selected text',
    'info'
  );

  const title = `Selected Text - ${tab.title || 'Unknown Page'}`;
  await convertTextToPDF(selectedText, title, tab);
}

// Handle full page conversion
async function handleFullPageConversion(info, tab) {
  showNotification(
    'Converting Page...',
    'Extracting and converting page content',
    'info'
  );

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractFullPageText
    });

    const pageText = results[0].result;
    
    if (!pageText || pageText.trim().length === 0) {
      showNotification(
        'No Content Found',
        'Unable to extract text from the current page',
        'warning'
      );
      return;
    }

    const title = tab.title || 'Full Page Content';
    await convertTextToPDF(pageText, title, tab);
    
  } catch (error) {
    console.error('Error extracting page text:', error);
    showNotification(
      'Extraction Failed',
      'Could not extract text from this page',
      'error'
    );
  }
}

// Handle visible content conversion
async function handleVisibleContentConversion(info, tab) {
  showNotification(
    'Converting Visible Content...',
    'Extracting visible text content',
    'info'
  );

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractVisibleText
    });

    const visibleText = results[0].result;
    
    if (!visibleText || visibleText.trim().length === 0) {
      showNotification(
        'No Visible Content',
        'No visible text content found on this page',
        'warning'
      );
      return;
    }

    const title = `Visible Content - ${tab.title || 'Unknown Page'}`;
    await convertTextToPDF(visibleText, title, tab);
    
  } catch (error) {
    console.error('Error extracting visible text:', error);
    showNotification(
      'Extraction Failed',
      'Could not extract visible text from this page',
      'error'
    );
  }
}

// Extract full page text (injected function)
function extractFullPageText() {
  // Remove script and style elements
  const scripts = document.querySelectorAll('script, style, noscript');
  scripts.forEach(el => el.remove());
  
  // Get text content and clean it up
  let text = document.body.innerText || document.body.textContent || '';
  
  // Clean up extra whitespace and normalize line breaks
  text = text.replace(/\s+/g, ' ')
             .replace(/\n\s*\n/g, '\n\n')
             .trim();
  
  return text;
}

// Extract only visible text (injected function)
function extractVisibleText() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || 
            style.visibility === 'hidden' || 
            style.opacity === '0' ||
            parent.tagName === 'SCRIPT' ||
            parent.tagName === 'STYLE') {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let text = '';
  let node;
  
  while (node = walker.nextNode()) {
    const nodeText = node.textContent.trim();
    if (nodeText) {
      text += nodeText + ' ';
    }
  }
  
  return text.trim();
}

// Convert text to PDF using the server
async function convertTextToPDF(text, title, tab) {
  try {
    // Validate text length
    if (text.length > 100000) {
      showNotification(
        'Text Too Long',
        'Text exceeds maximum length of 100,000 characters',
        'warning'
      );
      return;
    }

    const response = await fetch(`${SERVER_URL}${CONVERT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        text: text, 
        title: title 
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    // Get the PDF blob
    const blob = await response.blob();
    
    // Create download in content script to avoid CORS issues
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: downloadPDF,
      args: [blob, title]
    });

    // Show success notification
    showNotification(
      'PDF Generated!',
      `Successfully converted "${title}" to PDF`,
      'success'
    );

    // Update statistics
    updateStats(text.length);

  } catch (error) {
    console.error('PDF conversion error:', error);
    
    let errorMessage = 'Unknown error occurred';
    if (error.message.includes('fetch')) {
      errorMessage = 'Cannot connect to PDF server';
    } else if (error.message.includes('Server error')) {
      errorMessage = 'Server error during conversion';
    }
    
    showNotification(
      'Conversion Failed',
      errorMessage,
      'error'
    );
  }
}

// Download PDF function (injected)
function downloadPDF(blob, title) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9\s\-_]/gi, '')}.pdf` || 'converted_text.pdf';
  
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Check server health
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${SERVER_URL}${HEALTH_ENDPOINT}`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    if (response.ok) {
      serverStatus = { 
        online: true, 
        lastChecked: new Date().toISOString() 
      };
      console.log('Server health check: Online');
      return true;
    } else {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    serverStatus = { 
      online: false, 
      lastChecked: new Date().toISOString(),
      error: error.message 
    };
    console.log('Server health check: Offline -', error.message);
    return false;
  }
}

// Setup periodic health checks
function setupHealthChecks() {
  // Check every 30 seconds
  setInterval(checkServerHealth, 30000);
}

// Show notification to user
function showNotification(title, message, type = 'info') {
  const iconMap = {
    success: 'icons/success.png',
    error: 'icons/error.png',
    warning: 'icons/warning.png',
    info: 'icons/info.png'
  };

  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconMap[type] || 'icons/icon48.png',
    title: title,
    message: message,
    priority: type === 'error' ? 2 : 1
  });

  // Auto-clear notification after 5 seconds
  setTimeout(() => {
    chrome.notifications.clear();
  }, 5000);
}

// Update usage statistics
function updateStats(textLength) {
  chrome.storage.local.get(['conversionStats'], (result) => {
    const stats = result.conversionStats || {
      totalConversions: 0,
      totalCharacters: 0,
      lastConversion: null
    };
    
    stats.totalConversions++;
    stats.totalCharacters += textLength;
    stats.lastConversion = new Date().toISOString();
    
    chrome.storage.local.set({ conversionStats: stats });
  });
}

// Handle extension messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getServerStatus':
      sendResponse(serverStatus);
      break;
      
    case 'checkHealth':
      checkServerHealth().then(status => {
        sendResponse({ healthy: status });
      });
      return true; // Will respond asynchronously
      
    case 'getStats':
      chrome.storage.local.get(['conversionStats'], (result) => {
        sendResponse(result.conversionStats || {});
      });
      return true;
      
    case 'convertCustomText':
      handleCustomTextConversion(request.text, request.title)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Handle custom text conversion from popup
async function handleCustomTextConversion(text, title) {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }
  
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    throw new Error('Server is offline');
  }
  
  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  await convertTextToPDF(text, title || 'Custom Text', tab);
}

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('PDF Converter Pro started');
  checkServerHealth();
});

// Handle browser action click (if popup is not available)
chrome.action.onClicked.addListener((tab) => {
  // Fallback behavior - convert current page
  handleFullPageConversion({}, tab);
});

console.log('PDF Converter Pro background script loaded successfully');