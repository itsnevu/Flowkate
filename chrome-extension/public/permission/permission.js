document.addEventListener('DOMContentLoaded', () => {
  // Set up i18n text content
  document.getElementById('title').textContent = chrome.i18n.getMessage('permissions_microphone_title');
  document.getElementById('description').textContent = chrome.i18n.getMessage('permissions_microphone_description');

  const requestButton = document.getElementById('requestPermission');
  const statusText = document.getElementById('status');

  requestButton.textContent = chrome.i18n.getMessage('permissions_microphone_grantButton');

  requestButton.addEventListener('click', async () => {
    try {
      statusText.textContent = chrome.i18n.getMessage('permissions_microphone_requesting');
      statusText.className = '';

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Permission granted - stop the tracks immediately
      stream.getTracks().forEach(track => track.stop());

      // Update UI
      statusText.textContent = chrome.i18n.getMessage('permissions_microphone_grantedSuccess');
      statusText.className = 'success';
      requestButton.textContent = chrome.i18n.getMessage('permissions_microphone_grantedButton');
      requestButton.disabled = true;

      // Close window after a short delay
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      console.error('Permission denied or error:', error);

      let errorMessage = chrome.i18n.getMessage('permissions_microphone_denied');

      if (error.name === 'NotAllowedError') {
        // Either they just clicked Block, or Chrome never asked because it already remembers one.
        showBlocked();
        return;
      } else if (error.name === 'NotFoundError') {
        errorMessage += chrome.i18n.getMessage('permissions_microphone_notFound');
      } else {
        errorMessage += error.message;
      }

      statusText.textContent = '❌ ' + errorMessage;
      statusText.className = 'error';
    }
  });

  const settingsButton = document.getElementById('openSettings');
  const settingsUrl = `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}`;

  settingsButton.textContent = chrome.i18n.getMessage('permissions_microphone_openSettings');

  // A page cannot navigate itself to chrome://settings, but an extension may open one in a tab.
  settingsButton.addEventListener('click', () => {
    chrome.tabs.create({ url: settingsUrl }, () => {
      if (chrome.runtime.lastError) {
        statusText.textContent = `${chrome.i18n.getMessage('permissions_microphone_settingsFallback')} ${settingsUrl}`;
        statusText.className = 'error';
      }
    });
  });

  /**
   * Once Chrome has remembered a Block, getUserMedia rejects immediately and no prompt is shown,
   * so the grant button on its own is a button that cannot succeed. Say what happened, point at
   * the one place that undoes it, and leave a retry for after they have.
   */
  const showBlocked = () => {
    statusText.textContent = `${chrome.i18n.getMessage('permissions_microphone_blocked')} ${chrome.i18n.getMessage('permissions_microphone_blockedHelp')}`;
    statusText.className = 'error';
    requestButton.textContent = chrome.i18n.getMessage('permissions_microphone_tryAgain');
    requestButton.disabled = false;
    settingsButton.hidden = false;
  };

  navigator.permissions
    .query({ name: 'microphone' })
    .then(permissionStatus => {
      if (permissionStatus.state === 'granted') {
        statusText.textContent = chrome.i18n.getMessage('permissions_microphone_alreadyGranted');
        statusText.className = 'success';
        requestButton.textContent = chrome.i18n.getMessage('permissions_microphone_alreadyGrantedButton');
        requestButton.disabled = true;
        return;
      }
      if (permissionStatus.state === 'denied') {
        showBlocked();
      }
      // Reflect a reset made in the settings tab without needing this window reopened.
      permissionStatus.onchange = () => {
        if (permissionStatus.state === 'granted') {
          window.close();
        } else if (permissionStatus.state === 'denied') {
          showBlocked();
        } else {
          statusText.textContent = '';
          statusText.className = '';
          settingsButton.hidden = true;
          requestButton.textContent = chrome.i18n.getMessage('permissions_microphone_grantButton');
        }
      };
    })
    .catch(err => {
      console.log('Permission query not supported:', err);
    });
});
