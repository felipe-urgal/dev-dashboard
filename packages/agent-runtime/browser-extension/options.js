const token = document.querySelector('#token');
const port = document.querySelector('#port');
const status = document.querySelector('#status');
chrome.storage.local.get(['bridgeToken', 'bridgePort']).then((value) => { token.value = value.bridgeToken || ''; port.value = value.bridgePort || 43821; });
document.querySelector('#form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const bridgeToken = token.value.trim();
  const bridgePort = Number(port.value);
  if (!/^[a-f0-9]{64}$/i.test(bridgeToken) || !Number.isInteger(bridgePort) || bridgePort < 1 || bridgePort > 65535) { status.value = 'Invalid token or port'; return; }
  await chrome.storage.local.set({ bridgeToken, bridgePort });
  status.value = 'Saved';
});
