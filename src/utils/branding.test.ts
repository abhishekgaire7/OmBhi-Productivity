import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Branding: Icon files exist in public/ with appropriate sizes', () => {
  const iconPath = path.join(process.cwd(), 'public', 'ombhi-icon.png');
  const appleTouchPath = path.join(process.cwd(), 'public', 'apple-touch-icon.png');
  const pwa192Path = path.join(process.cwd(), 'public', 'pwa-192x192.png');
  const pwa512Path = path.join(process.cwd(), 'public', 'pwa-512x512.png');
  const faviconIcoPath = path.join(process.cwd(), 'public', 'favicon.ico');
  const faviconPngPath = path.join(process.cwd(), 'public', 'favicon.png');

  assert.ok(fs.existsSync(iconPath), 'ombhi-icon.png must exist in public/');
  assert.ok(fs.statSync(iconPath).size > 10000, 'ombhi-icon.png must not be empty');

  assert.ok(fs.existsSync(appleTouchPath), 'apple-touch-icon.png must exist');
  assert.ok(fs.existsSync(pwa192Path), 'pwa-192x192.png must exist');
  assert.ok(fs.existsSync(pwa512Path), 'pwa-512x512.png must exist');
  assert.ok(fs.existsSync(faviconIcoPath), 'favicon.ico must exist');
  assert.ok(fs.existsSync(faviconPngPath), 'favicon.png must exist');
});

test('Branding: manifest.json defines OmBhi PWA metadata and icons', () => {
  const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');

  const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(content.short_name, 'OmBhi');
  assert.ok(content.name.includes('OmBhi'));
  assert.ok(content.name.includes('Personal Productivity'));

  const iconSrcs = content.icons.map((i: { src: string }) => i.src);
  assert.ok(iconSrcs.includes('/pwa-192x192.png'), 'manifest must include 192x192 icon');
  assert.ok(iconSrcs.includes('/pwa-512x512.png'), 'manifest must include 512x512 icon');
  assert.ok(iconSrcs.includes('/ombhi-icon.png'), 'manifest must include ombhi-icon.png');
});

test('Branding: index.html links to ombhi-icon, apple-touch-icon, and manifest', () => {
  const htmlPath = path.join(process.cwd(), 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('href="/ombhi-icon.png"'), 'index.html must link to ombhi-icon.png');
  assert.ok(html.includes('href="/apple-touch-icon.png"'), 'index.html must link to apple-touch-icon.png');
  assert.ok(html.includes('href="/manifest.json"'), 'index.html must link to manifest.json');
});

test('Branding: Sidebar, MobileNav, and SignInView implement OmBhi icon and Personal Productivity subtitle', () => {
  const sidebarPath = path.join(process.cwd(), 'src', 'components', 'Sidebar.tsx');
  const mobileNavPath = path.join(process.cwd(), 'src', 'components', 'MobileNav.tsx');
  const signInPath = path.join(process.cwd(), 'src', 'components', 'SignInView.tsx');

  const sidebar = fs.readFileSync(sidebarPath, 'utf8');
  assert.ok(sidebar.includes('src="/ombhi-icon.png"'), 'Sidebar must render ombhi-icon.png');
  assert.ok(sidebar.includes('OmBhi'), 'Sidebar must have OmBhi as main title');
  assert.ok(sidebar.includes('Personal Productivity'), 'Sidebar must have Personal Productivity subtitle');

  const mobileNav = fs.readFileSync(mobileNavPath, 'utf8');
  assert.ok(mobileNav.includes('src="/ombhi-icon.png"'), 'MobileNav must render ombhi-icon.png');
  assert.ok(mobileNav.includes('Personal Productivity'), 'MobileNav must have Personal Productivity subtitle');

  const signIn = fs.readFileSync(signInPath, 'utf8');
  assert.ok(signIn.includes('src="/ombhi-icon.png"'), 'SignInView must render ombhi-icon.png');
  assert.ok(signIn.includes('Personal Productivity'), 'SignInView must include Personal Productivity branding');
});
