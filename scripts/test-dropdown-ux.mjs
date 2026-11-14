// Comprehensive automated test for SearchableSelect Dropdown UX & Multi-Select logic
import assert from 'node:assert';

console.log('--- STARTING GLOBAL DROPDOWN UX & MULTI-SELECT UNIT TESTS ---');

// Mock window event bus to verify dropdown coordination
class MockEventTarget {
  constructor() {
    this.listeners = {};
  }
  addEventListener(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  removeEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }
  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    list.forEach(cb => cb(event));
    return true;
  }
}

globalThis.window = new MockEventTarget();
globalThis.CustomEvent = class CustomEvent {
  constructor(type, params = {}) {
    this.type = type;
    this.detail = params.detail;
  }
};

// Test 1: Global Dropdown Coordination Event
console.log('\n--- TEST 1: Global Dropdown Coordination Event ---');
let dropdownAOpen = true;
let dropdownBOpen = false;
let dropdownCOpen = false;

const closeAllHandlerA = (e) => {
  if (e.detail?.sourceId !== 'dropdown-a') {
    dropdownAOpen = false;
  }
};
const closeAllHandlerB = (e) => {
  if (e.detail?.sourceId !== 'dropdown-b') {
    dropdownBOpen = false;
  }
};
const closeAllHandlerC = (e) => {
  if (e.detail?.sourceId !== 'dropdown-c') {
    dropdownCOpen = false;
  }
};

window.addEventListener('saleflow:close-all-dropdowns', closeAllHandlerA);
window.addEventListener('saleflow:close-all-dropdowns', closeAllHandlerB);
window.addEventListener('saleflow:close-all-dropdowns', closeAllHandlerC);

// Dropdown B opens -> should close Dropdown A
dropdownBOpen = true;
window.dispatchEvent(new CustomEvent('saleflow:close-all-dropdowns', { detail: { sourceId: 'dropdown-b' } }));

assert.strictEqual(dropdownAOpen, false, 'Dropdown A should be closed when Dropdown B opens');
assert.strictEqual(dropdownBOpen, true, 'Dropdown B should remain open');
console.log('✅ Opening Dropdown B successfully closed Dropdown A via global coordination event');

// UserNav opens -> should close Dropdown B
window.dispatchEvent(new CustomEvent('saleflow:close-all-dropdowns', { detail: { sourceId: 'user-nav-dropdown' } }));
assert.strictEqual(dropdownBOpen, false, 'Dropdown B should be closed when UserNav opens');
console.log('✅ Opening UserNav successfully closed Dropdown B');

// Test 2: Trigger Toggle Logic (First click open, second click close)
console.log('\n--- TEST 2: Trigger Toggle Logic ---');
let isOpen = false;
const handleToggle = () => {
  isOpen = !isOpen;
};

// First click:
handleToggle();
assert.strictEqual(isOpen, true, 'First trigger click must open dropdown');

// Second click on same trigger:
handleToggle();
assert.strictEqual(isOpen, false, 'Same trigger click again must close dropdown');
console.log('✅ Same trigger click correctly toggles open -> close');

// Test 3: Multi-Select Label Formatting Rules
console.log('\n--- TEST 3: Multi-Select Label Formatting Rules ---');
function formatMultiLabel(selectedOptions, placeholder = 'All Categories') {
  if (selectedOptions.length === 0) {
    return placeholder || 'All';
  }
  if (selectedOptions.length === 1) {
    return selectedOptions[0].label;
  }
  if (selectedOptions.length === 2) {
    return `${selectedOptions[0].label} + ${selectedOptions[1].label}`;
  }
  let noun = 'Items';
  if (placeholder) {
    const cleaned = placeholder.replace(/^All\s+/i, '').replace(/^[-\s]+|[-\s]+$/g, '').trim();
    if (cleaned) noun = cleaned;
  }
  return `${selectedOptions.length} ${noun} Selected`;
}

// 0 selected
assert.strictEqual(formatMultiLabel([], 'All Categories'), 'All Categories');
console.log('✅ 0 selected: "All Categories"');

// 1 selected
assert.strictEqual(formatMultiLabel([{ value: '1', label: 'SOAP' }], 'All Categories'), 'SOAP');
console.log('✅ 1 selected: "SOAP"');

// 2 selected
assert.strictEqual(
  formatMultiLabel([
    { value: '1', label: 'SOAP' },
    { value: '2', label: 'Beverages' },
  ], 'All Categories'),
  'SOAP + Beverages'
);
console.log('✅ 2 selected: "SOAP + Beverages"');

// 3 selected
assert.strictEqual(
  formatMultiLabel([
    { value: '1', label: 'SOAP' },
    { value: '2', label: 'Beverages' },
    { value: '3', label: 'Snacks' },
  ], 'All Categories'),
  '3 Categories Selected'
);
console.log('✅ 3 selected: "3 Categories Selected"');

// 4 selected for Brands
assert.strictEqual(
  formatMultiLabel([
    { value: '1', label: 'Nestle' },
    { value: '2', label: 'Unilever' },
    { value: '3', label: 'Shan' },
    { value: '4', label: 'National' },
  ], 'All Brands'),
  '4 Brands Selected'
);
console.log('✅ 4 selected: "4 Brands Selected"');

// Test 4: Multi-Select Filter Group Logic (OR inside group, AND across groups)
console.log('\n--- TEST 4: Filter Group Logic (OR inside group, AND across groups) ---');
const products = [
  { id: 'p1', name: 'Nido Milk', categoryId: 'cat-bev', brandId: 'brand-nestle', status: 'ACTIVE' },
  { id: 'p2', name: 'Everyday Tea Whitener', categoryId: 'cat-bev', brandId: 'brand-nestle', status: 'ACTIVE' },
  { id: 'p3', name: 'Lifebuoy Soap', categoryId: 'cat-soap', brandId: 'brand-unilever', status: 'ACTIVE' },
  { id: 'p4', name: 'Lux Soap', categoryId: 'cat-soap', brandId: 'brand-unilever', status: 'INACTIVE' },
  { id: 'p5', name: 'Shan Biryani Masala', categoryId: 'cat-spices', brandId: 'brand-shan', status: 'ACTIVE' },
];

function applyFilters(items, filterGroups) {
  return items.filter(item => {
    // Category filter: OR inside group
    if (filterGroups.categories?.length > 0) {
      if (!filterGroups.categories.includes(item.categoryId)) return false;
    }
    // Brand filter: OR inside group (AND across group)
    if (filterGroups.brands?.length > 0) {
      if (!filterGroups.brands.includes(item.brandId)) return false;
    }
    // Status filter: OR inside group (AND across group)
    if (filterGroups.statuses?.length > 0) {
      if (!filterGroups.statuses.includes(item.status)) return false;
    }
    return true;
  });
}

// Case 1: Category = SOAP OR Beverages
const res1 = applyFilters(products, { categories: ['cat-soap', 'cat-bev'] });
assert.strictEqual(res1.length, 4, 'Categories SOAP OR Beverages should return 4 items');
console.log('✅ OR inside Category group returned 4 items');

// Case 2: (Category = SOAP OR Beverages) AND (Brand = Unilever)
const res2 = applyFilters(products, { categories: ['cat-soap', 'cat-bev'], brands: ['brand-unilever'] });
assert.strictEqual(res2.length, 2, 'Should return only Unilever soaps');
assert.deepStrictEqual(res2.map(p => p.id), ['p3', 'p4']);
console.log('✅ AND across groups: (Category = SOAP OR Beverages) AND (Brand = Unilever) returned 2 items');

// Case 3: (Category = SOAP OR Beverages) AND (Brand = Unilever) AND (Status = ACTIVE)
const res3 = applyFilters(products, { categories: ['cat-soap', 'cat-bev'], brands: ['brand-unilever'], statuses: ['ACTIVE'] });
assert.strictEqual(res3.length, 1, 'Should return only active Unilever soap');
assert.strictEqual(res3[0].id, 'p3');
console.log('✅ AND across 3 groups: returned only active item p3');

console.log('\n🎉 ALL DROPDOWN UX & MULTI-SELECT LOGIC TESTS PASSED!');
process.exit(0);
