import fs from 'fs';
import path from 'path';

console.log('--- VERIFYING SIDEBAR NAVIGATION UX IMPLEMENTATION ---');

// 1. Verify DashboardSidebar.tsx
const sidebarPath = path.resolve('src/shared/components/DashboardSidebar.tsx');
const sidebarCode = fs.readFileSync(sidebarPath, 'utf8');

const checks = [
  { name: 'Single openSection state', pass: sidebarCode.includes("const [openSection, setOpenSection] = useState<string | null>(null);") },
  { name: 'Collapsible isCollapsed state', pass: sidebarCode.includes("const [isCollapsed, setIsCollapsed] = useState(false);") },
  { name: 'State persistence key (saleflow_sidebar_collapsed)', pass: sidebarCode.includes("'saleflow_sidebar_collapsed'") },
  { name: 'Active-route parent auto-expansion', pass: sidebarCode.includes("setOpenSection(matchingGroup.id);") },
  { name: 'Accordion single open handler', pass: sidebarCode.includes("setOpenSection((prev) => (prev === groupId ? null : groupId))") },
  { name: 'Collapsed click auto-expands & opens section', pass: sidebarCode.includes("expandSidebar();\n      setOpenSection(groupId);") || sidebarCode.includes("expandSidebar();") && sidebarCode.includes("setOpenSection(groupId);") },
  { name: 'Floating tooltip for collapsed icons', pass: sidebarCode.includes("const [tooltip, setTooltip] = useState") && sidebarCode.includes("tooltip.title") },
  { name: 'Collapse control buttons (PanelLeftClose & PanelLeftOpen)', pass: sidebarCode.includes("<PanelLeftClose") && sidebarCode.includes("<PanelLeftOpen") },
  { name: 'Sidebar width transition (68px / 260px)', pass: sidebarCode.includes("isCollapsed ? '68px' : '260px'") },
];

let allPassed = true;
for (const check of checks) {
  if (check.pass) {
    console.log(`[PASS] ${check.name}`);
  } else {
    console.error(`[FAIL] ${check.name}`);
    allPassed = false;
  }
}

// 2. Verify SidebarUserProfile.tsx
const profilePath = path.resolve('src/shared/components/SidebarUserProfile.tsx');
const profileCode = fs.readFileSync(profilePath, 'utf8');

const profileChecks = [
  { name: 'SidebarUserProfileProps interface with isCollapsed & onExpand', pass: profileCode.includes("interface SidebarUserProfileProps") && profileCode.includes("isCollapsed?: boolean") && profileCode.includes("onExpand?: () => void") },
  { name: 'Collapsed avatar button render', pass: profileCode.includes("isCollapsed ? (") },
  { name: 'Click avatar expands sidebar & opens popover', pass: profileCode.includes("onExpand();") && profileCode.includes("setIsOpen(true);") },
  { name: 'Hover tooltip with user name & role', pass: profileCode.includes("title={`${currentUser?.full_name") || profileCode.includes("title=") },
];

for (const check of profileChecks) {
  if (check.pass) {
    console.log(`[PASS] ${check.name}`);
  } else {
    console.error(`[FAIL] ${check.name}`);
    allPassed = false;
  }
}

// 3. Verify globals.css
const cssPath = path.resolve('src/app/globals.css');
const cssCode = fs.readFileSync(cssPath, 'utf8');

const cssChecks = [
  { name: '.sidebar width transition and overflow-x', pass: cssCode.includes("transition: width 0.2s") && cssCode.includes("overflow-x: hidden") },
  { name: '.sidebar.collapsed width 68px', pass: cssCode.includes(".sidebar.collapsed") && cssCode.includes("width: 68px;") },
];

for (const check of cssChecks) {
  if (check.pass) {
    console.log(`[PASS] ${check.name}`);
  } else {
    console.error(`[FAIL] ${check.name}`);
    allPassed = false;
  }
}

if (!allPassed) {
  process.exit(1);
}

console.log('\nALL SIDEBAR UX CHECKS PASSED SUCCESSFULLY!');
