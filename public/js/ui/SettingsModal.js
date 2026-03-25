/** Wires up the settings modal. */
export class SettingsModal {
  /**
   * @param {import('../data/Storage.js').Storage} storage
   * @param {object} callbacks
   * @param {function(boolean)} callbacks.onSoundChange
   */
  constructor(storage, callbacks) {
    this.storage = storage;
    this.modal = document.getElementById('settings-modal');
    this.soundToggle = document.getElementById('setting-sound');
    this.touristToggle = document.getElementById('setting-tourist');
    this.touristRow = document.getElementById('tourist-toggle-row');
    this.rendererToggle = document.getElementById('setting-renderer-3d');
    this.nameInput = document.getElementById('setting-name');
    this.stopGameRow = document.getElementById('stop-game-row');
    this.stopGameBtn = document.getElementById('btn-stop-game');

    // Init from saved settings
    const settings = storage.getSettings();
    this.soundToggle.checked = settings.sound;
    this.touristToggle.checked = settings.humanTourist === true;
    if (this.rendererToggle) {
      this.rendererToggle.checked = settings.renderer3d === true;
    }

    // Init name
    const name = storage.getPlayerName();
    if (this.nameInput) {
      this.nameInput.value = name === 'Anonymous' ? '' : name;
    }

    // Events
    this.soundToggle.addEventListener('change', () => {
      const on = this.soundToggle.checked;
      storage.setSetting('sound', on);
      callbacks.onSoundChange(on);
    });

    this.touristToggle.addEventListener('change', () => {
      storage.setSetting('humanTourist', this.touristToggle.checked);
    });

    if (this.rendererToggle) {
      this.rendererToggle.addEventListener('change', () => {
        const use3d = this.rendererToggle.checked;
        storage.setSetting('renderer3d', use3d);
        if (callbacks.onRendererChange) {
          callbacks.onRendererChange(use3d);
        }
      });
    }

    // Name input — save on blur or Enter
    if (this.nameInput) {
      const saveName = () => {
        const val = this.nameInput.value.trim();
        storage.setPlayerName(val || 'Anonymous');
      };
      this.nameInput.addEventListener('blur', saveName);
      this.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveName();
          this.nameInput.blur();
        }
      });
    }

    // Stop game button
    if (this.stopGameBtn && callbacks.onStopGame) {
      this.stopGameBtn.addEventListener('click', callbacks.onStopGame);
    }

    // Close
    this.modal.querySelector('.close-btn').addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
  }

  open() {
    // Refresh name in case it was set elsewhere
    const name = this.storage.getPlayerName();
    if (this.nameInput) {
      this.nameInput.value = name === 'Anonymous' ? '' : name;
    }
    this.modal.classList.remove('hidden');
  }

  close() {
    // Save name on close
    if (this.nameInput) {
      const val = this.nameInput.value.trim();
      this.storage.setPlayerName(val || 'Anonymous');
    }
    this.modal.classList.add('hidden');
  }

  isOpen() {
    return !this.modal.classList.contains('hidden');
  }

  /** Show/hide context-dependent rows based on whether we're in the main menu. */
  setMenuContext(isMenu) {
    if (this.touristRow) {
      this.touristRow.style.display = isMenu ? '' : 'none';
    }
    if (this.stopGameRow) {
      this.stopGameRow.style.display = isMenu ? 'none' : '';
    }
  }
}
