const {Disposable} = require('via');

module.exports = class TabBarView {
    constructor() {
        this.element = document.createElement('tab-bar');
        this.element.classList.add('tab-bar');
        return this.element;
    }

    destroy() {
        // this.activeItemSubscription.dispose();
        this.element.remove();
    }
}
