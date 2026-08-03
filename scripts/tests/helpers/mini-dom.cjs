// scripts/tests/helpers/mini-dom.cjs
'use strict';

// A deliberately small DOM, sufficient to execute js/business-directories.js
// against real generated markup. It exists so the client script is tested by
// running it, not by matching strings in its source.
//
// It parses only the subset this project emits, which is already proven
// well-formed by the component tests. It is a test harness, not a browser.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

class Node {
  constructor(tag, attrs = {}) {
    this.tagName = tag ? tag.toUpperCase() : null;
    this.attributes = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this.text = '';
    this.listeners = {};
  }

  get className() { return this.attributes.class || ''; }
  set className(v) { this.attributes.class = v; }

  get hidden() { return this.attributes.hidden !== undefined && this.attributes.hidden !== false; }
  set hidden(v) { if (v) this.attributes.hidden = ''; else delete this.attributes.hidden; }

  get checked() { return this._checked === true; }
  set checked(v) { this._checked = !!v; }

  get value() { return this._value !== undefined ? this._value : (this.attributes.value || ''); }
  set value(v) { this._value = v; }

  get textContent() {
    if (this.children.length === 0) return this.text;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) { this.children = []; this.text = String(v); }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name] : null;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const i = this.children.indexOf(ref);
    node.parentNode = this;
    this.children.splice(i < 0 ? this.children.length : i, 0, node);
    return node;
  }

  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }

  // Test-only: synchronously fire the handlers the script registered.
  dispatch(type) {
    (this.listeners[type] || []).forEach((fn) => fn({ target: this, type }));
  }

  descendants(acc = []) {
    for (const child of this.children) {
      acc.push(child);
      child.descendants(acc);
    }
    return acc;
  }

  matches(selector) {
    const attr = selector.match(/^\[([a-zA-Z0-9-]+)\]$/);
    if (attr) return Object.prototype.hasOwnProperty.call(this.attributes, attr[1]);
    if (selector.startsWith('.')) {
      return this.className.split(/\s+/).includes(selector.slice(1));
    }
    return this.tagName === selector.toUpperCase();
  }

  querySelector(selector) {
    return this.descendants().find((n) => n.matches(selector)) || null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((n) => n.matches(selector));
  }
}

function parseAttributes(raw) {
  const attrs = {};
  for (const m of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*"([^"]*)")?/g)) {
    if (!m[1]) continue;
    attrs[m[1]] = m[2] !== undefined ? m[2] : '';
  }
  return attrs;
}

function parse(html) {
  const root = new Node(null);
  const stack = [root];
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|[^>])*?)(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const between = clean.slice(last, m.index).trim();
    if (between) {
      const textNode = new Node(null);
      textNode.text = between;
      textNode.parentNode = stack[stack.length - 1];
      stack[stack.length - 1].children.push(textNode);
    }
    last = re.lastIndex;

    const [, closing, tag, rawAttrs, selfClose] = m;
    const name = tag.toLowerCase();
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = new Node(name, parseAttributes(rawAttrs));
    stack[stack.length - 1].appendChild(node);
    if (!VOID.has(name) && !selfClose) stack.push(node);
  }
  return root;
}

// Builds a document object with the handful of members the script touches.
function createDocument(html) {
  const root = parse(html);
  const document = {
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    createElement: (tag) => new Node(tag),
    root,
  };
  return document;
}

module.exports = { createDocument, parse, Node };
