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
    this.nameInput = document.getElementById('setting-name');

    // Init from saved settings
    const settings = storage.getSettings();
    this.soundToggle.checked = settings.sound;
    this.touristToggle.checked = settings.humanTourist === true;

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

  /** Show/hide the tourist toggle based on whether we're in the main menu. */
  setMenuContext(isMenu) {
    if (this.touristRow) {
      this.touristRow.style.display = isMenu ? '' : 'none';
    }
  }
}
