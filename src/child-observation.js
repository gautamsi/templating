import {DOM} from 'aurelia-pal';
import {metadata} from 'aurelia-metadata';
import {HtmlBehaviorResource} from './html-behavior';

function createChildObserverDecorator(selectorOrConfig, all, deep) {
  return function(target, key, descriptor) {
    let actualTarget = typeof key === 'string' ? target.constructor : target; //is it on a property or a class?
    let r = metadata.getOrCreateOwn(metadata.resource, HtmlBehaviorResource, actualTarget);

    if (typeof selectorOrConfig === 'string') {
      selectorOrConfig = {
        selector: selectorOrConfig,
        name: key,
        deep:deep || false
      };
    }

    if (descriptor) {
      descriptor.writable = true;
    }

    selectorOrConfig.all = all;
    r.addChildBinding(new ChildObserver(selectorOrConfig));
  };
}

/**
* Creates a behavior property that references an array of immediate content child elements that matches the provided selector.
*/
export function children(selectorOrConfig: string | Object, deep?: boolean): any {
  return createChildObserverDecorator(selectorOrConfig, true, deep);
}

/**
* Creates a behavior property that references an immediate content child element that matches the provided selector.
*/
export function child(selectorOrConfig: string | Object, deep?: boolean): any {
  return createChildObserverDecorator(selectorOrConfig, false, deep);
}

class ChildObserver {
  constructor(config) {
    this.name = config.name;
    this.changeHandler = config.changeHandler || this.name + 'Changed';
    this.selector = config.selector;
    this.all = config.all;
    this.deep = config.deep;
  }

  create(target, viewModel) {
    return new ChildObserverBinder(this.selector, target, this.name, viewModel, this.changeHandler, this.all, this.deep);
  }
}

const noMutations = [];

function trackMutation(groupedMutations, binder, record) {
  let mutations = groupedMutations.get(binder);

  if (!mutations) {
    mutations = [];
    groupedMutations.set(binder, mutations);
  }

  mutations.push(record);
}

function onChildChange(mutations, observer) {
  let binders = observer.binders;
  let bindersLength = binders.length;
  let groupedMutations = new Map();

  for (let i = 0, ii = mutations.length; i < ii; ++i) {
    let record = mutations[i];
    let added = record.addedNodes;
    let removed = record.removedNodes;

    for (let j = 0, jj = removed.length; j < jj; ++j) {
      let node = removed[j];
      if (node.nodeType === 1) {
        for (let k = 0; k < bindersLength; ++k) {
          let binder = binders[k];
          if (binder.onRemove(node)) {
            trackMutation(groupedMutations, binder, record);
          }
        }
      }
    }

    for (let j = 0, jj = added.length; j < jj; ++j) {
      let node = added[j];
      if (node.nodeType === 1) {
        for (let k = 0; k < bindersLength; ++k) {
          let binder = binders[k];
          if (binder.onAdd(node)) {
            trackMutation(groupedMutations, binder, record);
          }
        }
      }
    }
  }

  groupedMutations.forEach((value, key) => {
    if (key.changeHandler !== null) {
      key.viewModel[key.changeHandler](value);
    }
  });
}

class ChildObserverBinder {
  constructor(selector, target, property, viewModel, changeHandler, all, deep) {
    this.selector = selector;
    this.target = target;
    this.property = property;
    this.viewModel = viewModel;
    this.changeHandler = changeHandler in viewModel ? changeHandler : null;
    this.all = all;
    this.deep = deep;
  }
  firstMatch(elements, selector){
      if(elements.length ==0)
        return undefined;
      
      for (var index = 0; index < elements.length; index++) {
          var element = elements[index];
          if(element.matches(selector))
            return element;
      }
  }

  bind(source) {
    let target = this.target;
    let viewModel = this.viewModel;
    let selector = this.selector;
    let current = target.firstElementChild;
    let observer = target.__childObserver__;

    if (!observer) {
      observer = target.__childObserver__ = DOM.createMutationObserver(onChildChange);
      observer.observe(target, {childList: true});
      observer.binders = [];
    }

    observer.binders.push(this);

    if (this.all) {
      let items:any[] = viewModel[this.property];
      if (!items) {
        items = viewModel[this.property] = [];
      } else {
        items.length = 0;
      }

      while (current) {
        if (current.matches(selector)) {
          items.push(current.au && current.au.controller ? current.au.controller.viewModel : current);
        }
        else if(this.deep){
            let first:Element = this.firstMatch(current.getElementsByTagName("*"),selector);
            if(first){
                while (first) {
                    if (first.matches(selector)) {
                        items.push(first.au && first.au.controller ? first.au.controller.viewModel : first);
                    }
                    first = first.nextElementSibling;
                }
            } 
        }

        current = current.nextElementSibling;
      }      

      if (this.changeHandler !== null) {
        this.viewModel[this.changeHandler](noMutations);
      }
    } else {
      let value = undefined;
      while (current) {
        if (current.matches(selector)) {
          value = current.au && current.au.controller ? current.au.controller.viewModel : current;
          break;
        }
        else if(this.deep && !value){
            let firstDeep = this.firstMatch(current.getElementsByTagName("*"), selector);
            if(firstDeep){
                value = firstDeep.au && firstDeep.au.controller ? firstDeep.au.controller.viewModel : firstDeep;
            }
        }

        current = current.nextElementSibling;
      }
      if(value){
          this.viewModel[this.property] = value;

          if (this.changeHandler !== null) {
            this.viewModel[this.changeHandler](value);
          }
      }
    }
  }

  onRemove(element) {
    if (element.matches(this.selector)) {
      let value = element.au && element.au.controller ? element.au.controller.viewModel : element;

      if (this.all) {
        let items = this.viewModel[this.property];
        let index = items.indexOf(value);

        if (index !== -1) {
          items.splice(index, 1);
        }

        return true;
      }

      return false;
    }
  }

  onAdd(element) {
    let selector = this.selector;

    if (element.matches(selector)) {
      let value = element.au && element.au.controller ? element.au.controller.viewModel : element;

      if (this.all) {
        let items = this.viewModel[this.property];
        let index = 0;
        let prev = element.previousElementSibling;

        while (prev) {
          if (prev.matches(selector)) {
            index++;
          }

          prev = prev.previousElementSibling;
        }

        items.splice(index, 0, value);
        return true;
      }

      this.viewModel[this.property] = value;

      if (this.changeHandler !== null) {
        this.viewModel[this.changeHandler](value);
      }
    }

    return false;
  }

  unbind() {
    if (this.target.__childObserver__) {
      this.target.__childObserver__.disconnect();
      this.target.__childObserver__ = null;
    }
  }
}
