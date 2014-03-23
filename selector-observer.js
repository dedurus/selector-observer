(function(window) {
  'use strict';

  var Promise = window.Promise;
  var WeakMap = window.WeakMap;
  var SelectorSet = window.SelectorSet;
  var MutationObserver = window.MutationObserver;
  var slice = Array.prototype.slice;
  var bind = function(fn, self) {
    return function() {
      return fn.apply(self, arguments);
    };
  };

  function Deferred() {
    this.resolved = null;
    this.pending = [];
  }

  Deferred.prototype.resolve = function() {
    if (!this.resolved) {
      this.resolved = Promise.cast();
      var p = this.pending.length;
      while (p--) {
        this.resolved.then(this.pending[p]);
      }
    }
  };

  Deferred.prototype.then = function(onFulfilled) {
    if (this.resolved) {
      this.resolved.then(onFulfilled);
    } else {
      this.pending.push(onFulfilled);
    }
  };



  var styles = document.createElement('style');
  styles.type = 'text/css';
  document.head.appendChild(styles);

  var keyframes = document.createElement('style');
  keyframes.type = 'text/css';
  document.head.appendChild(keyframes);

  var uid = 0;
  function watch(selector){
    var key = 'SelectorObserver' + uid++;

    var div = document.createElement('div');
    var styleProps = window.getComputedStyle(div);

    var prefix;
    if ('animationName' in styleProps) {
      prefix = '';
    } else if ('MozAnimationName' in styleProps) {
      prefix = '-moz-';
    } else if ('msAnimationName' in styleProps) {
      prefix = '-ms-';
    } else if ('webkitAnimationName' in styleProps) {
      prefix = '-webkit-';
    } else {
      return;
    }

    var keyframe = '@' + prefix + 'keyframes ' + key + ' {\n  from { outline: 1px solid transparent }\n  to { outline: 0px solid transparent }\n}';
    var node = document.createTextNode(keyframe);
    keyframes.appendChild(node);

    var rule = selector + ' {\n  ' + prefix + 'animation-duration: 0.01s;\n  ' + prefix + 'animation-name: ' + key + ';\n}';
    styles.sheet.insertRule(rule, 0);
  }

  // hack for unmatching .checked = false
  watch(':checked');
  watch(':not(:checked)');


  function SelectorObserver(root) {
    if (!root) {
      throw new TypeError('Failed to construct \'SelectorObserver\': Argument must be a Node');
    }

    this.root = root;
    this.observers = [];
    this.selectorSet = new SelectorSet();
    this.handlers = new WeakMap();
    this.invalidatedElements = [];

    this.invalidateEventTarget = bind(this.invalidateEventTarget, this);
    this.invalidateMutationRecords = bind(this.invalidateMutationRecords, this);
    this.invalidateElement = bind(this.invalidateElement, this);
    this.checkForChanges = bind(this.checkForChanges, this);

    this.root.addEventListener('animationstart', this.invalidateEventTarget, true);
    this.root.addEventListener('oAnimationStart', this.invalidateEventTarget, true);
    this.root.addEventListener('MSAnimationStart', this.invalidateEventTarget, true);
    this.root.addEventListener('webkitAnimationStart', this.invalidateEventTarget, true);

    var self = this;
    this.root.addEventListener('DOMSubtreeModified', function(event) {
      event.target.onpropertychange = function() {
        self.invalidateElement(event.target);
      };
    }, true);

    var observer = new MutationObserver(this.invalidateMutationRecords);
    var config = {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true
    };
    observer.observe(this.root, config);
  }

  SelectorObserver.prototype.disconnect = function() {
    this.stopped = true;
  };

  SelectorObserver.prototype.observe = function(selector, handler) {
    var observer = {
      id: uid++,
      selector: selector,
      handler: handler,
      handlers: new WeakMap(),
      elements: []
    };
    watch(selector);
    this.selectorSet.add(selector, observer);
    this.observers.push(observer);
  };

  SelectorObserver.prototype.invalidateEventTarget = function(event) {
    this.invalidateElement(event.target);
  };

  SelectorObserver.prototype.invalidateMutationRecords = function(records) {
    var self = this;
    records.forEach(function(record) {
      self.invalidateElement(record.target);
      var i;
      for (i = 0; i < record.addedNodes.length; i++) {
        self.invalidateElement(record.addedNodes[i]);
      }
      for (i = 0; i < record.removedNodes.length; i++) {
        self.invalidateElement(record.removedNodes[i]);
      }
    });
  };

  SelectorObserver.prototype.invalidateElement = function(el) {
    this.invalidatedElements.push(el);

    if (typeof this.checkForChangesId !== 'number') {
      this.checkForChangesId = setTimeout(this.checkForChanges, 0);
    }
  };

  SelectorObserver.prototype.checkForChanges = function() {
    if (this.stopped) {
      return;
    }

    function runHandler(handler, el, deferred) {
      Promise.cast().then(function() {
        var result = handler.call(el, el);
        if (typeof result === 'function') {
          deferred.then(function() {
            result.call(el, el);
          });
        }
      });
    }

    var observer, deferred;
    var e, el;

    var m, matches = this.selectorSet.queryAll(this.root);
    for (m = 0; m < matches.length; m++) {
      var match = matches[m];
      observer = match.data;

      for (e = 0; e < match.elements.length; e++) {
        el = match.elements[e];

        if (!observer.handlers.get(el)) {
          deferred = new Deferred();
          observer.handlers.set(el, deferred);
          observer.elements.push(el);
          runHandler(observer.handler, el, deferred);
        }
      }
    }

    var i;
    for (i = 0; i < this.observers.length; i++) {
      observer = this.observers[i];
      matches = slice.call(this.root.querySelectorAll(observer.selector), 0);

      for (e = 0; e < observer.elements.length; e++) {
        el = observer.elements[e];

        if (matches.indexOf(el) === -1) {
          deferred = observer.handlers.get(el);
          if (deferred) {
            deferred.resolve();
            observer.handlers['delete'](el);
          }
        }
      }
    }

    this.checkForChangesId = null;
  };


  window.SelectorObserver = SelectorObserver;
})(this);
