#!/usr/bin/env node
/**
 * dsh-genui 真机 e2e：真实 dsh web + 插件 → 模型输出 dsh-ui fence → 浏览器渲染
 * → 点击 action 按钮 → 模型收到 [genui-action] 并响应更新。全程走真实链路，
 * 不 mock 任何环节。
 *
 * 前置：
 *   - `dsh` 在 PATH（主仓默认分支已含 fence-registry 的构建）
 *   - `pnpm` 在 PATH（`dsh plugin` 命令依赖）
 *   - `DEEPSEEK_API_KEY` 环境变量（模型要真的回复）
 *   - 主仓 web 构建产物带 playwright（apps/web/node_modules/playwright）
 *
 * 用法：
 *   DEEPSEEK_API_KEY=sk-... node scripts/e2e.mjs [--port 3088] [--keep] [--install git|link]
 *
 * 默认 link 安装当前工作区（测的就是当前代码）；--install git 走朋友的真实
 * 安装路径（git+https 拉远端仓库）。
 * 退出码 0 = PASS，1 = FAIL。
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DSH_ROOT = process.env.DSH_ROOT ?? resolve(process.env.HOME ?? '', '.dsh/source/current')
const PORT = Number(process.argv.find((a, i) => a === '--port' && process.argv[i + 1]) ? process.argv[process.argv.indexOf('--port') + 1] : 3088)
const KEEP = process.argv.includes('--keep')
const INSTALL = process.argv.includes('--install') ? process.argv[process.argv.indexOf('--install') + 1] : 'link'
const PROMPT = '用 dsh-ui 围栏输出一个订单监控面板：标题「订单监控」，三张 stat 卡（总收入、订单数、转化率，给任意示例数值），再加一个按钮（type: button, label: 刷新数据, action: refresh）。只输出这一个 dsh-ui 围栏，不要任何其他文字。'

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }
const log = (msg) => console.log(`· ${msg}`)

// ── 前置检查 ──────────────────────────────────────────────────────────────
if (!process.env.DEEPSEEK_API_KEY) fail('缺少 DEEPSEEK_API_KEY 环境变量（模型需要真实 key 才能回复）')
for (const cmd of ['dsh', 'pnpm']) {
  const r = spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' })
  if (r.status !== 0) fail(`未找到 ${cmd}，请先安装并确保在 PATH 上`)
}
log(`dsh: ${spawnSync('dsh', ['--version'], { encoding: 'utf8' }).stdout.trim()}`)
log(`pnpm: ${spawnSync('pnpm', ['--version'], { encoding: 'utf8' }).stdout.trim()}`)

// ── 临时环境 ──────────────────────────────────────────────────────────────
const DSH_HOME = await mkdtemp(join(tmpdir(), 'dsh-e2e-'))
const env = { ...process.env, DSH_HOME }
const webLog = join(DSH_HOME, 'dsh-web.log')
let webPid = null

const cleanup = async (keep) => {
  if (webPid !== null) { try { process.kill(-webPid, 'SIGKILL') } catch {} try { process.kill(webPid, 'SIGKILL') } catch {} }
  if (!keep) await rm(DSH_HOME, { recursive: true, force: true })
  else log(`保留临时环境: ${DSH_HOME}`)
}
process.on('exit', () => { void cleanup(KEEP) })
process.on('SIGINT', () => { void cleanup(KEEP); process.exit(130) })

try {
  // ── 安装插件 ────────────────────────────────────────────────────────────
  if (INSTALL === 'git') {
    log('安装插件（git+https，朋友路径）...')
    const r = spawnSync('dsh', ['plugin', '--profile', 'web', 'add', 'git+https://github.com/dsh-external/dsh-genui.git'], { env, stdio: 'inherit' })
    if (r.status !== 0) fail('git URL 安装失败（见上方输出）')
  } else {
    log('安装插件（link 当前工作区）...')
    const r = spawnSync('dsh', ['plugin', '--profile', 'web', 'add', `link:${REPO_ROOT}`], { env, stdio: 'inherit' })
    if (r.status !== 0) fail('link 安装失败（见上方输出）')
  }

  // ── 启动 dsh web ────────────────────────────────────────────────────────
  log(`启动 dsh web (port ${PORT}, DSH_HOME=${DSH_HOME})...`)
  const child = spawn('dsh', ['web', '--port', String(PORT)], { env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
  webPid = child.pid
  const BASE = `http://127.0.0.1:${PORT}`
  let ready = false
  for (let i = 0; i < 120; i++) {
    try { const res = await fetch(BASE); if (res.ok) { ready = true; break } } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!ready) fail('dsh web 120s 内未就绪（日志: ' + webLog + '）')
  log('dsh web 就绪')

  // ── 浏览器链路 ──────────────────────────────────────────────────────────
  const { chromium } = await import(pathToFileURL(join(DSH_ROOT, 'apps/web/node_modules/playwright/index.mjs')).href)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
  const pageErrors = []
  page.on('pageerror', e => pageErrors.push(String(e)))
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(3000)

  // 新会话
  await page.getByText('新会话', { exact: false }).first().click().catch(() => {})
  await page.waitForTimeout(1500)

  // 发送 prompt
  await page.locator('textarea').first().fill(PROMPT)
  await page.getByRole('button', { name: '发送消息' }).click().catch(() => page.keyboard.press('Enter'))
  log('prompt 已发送，等待模型输出 dsh-ui fence...')

  const genuiCount = () => page.evaluate(() => document.querySelectorAll('[data-genui]').length)
  const lastText = () => page.evaluate(() => {
    const msgs = [...document.querySelectorAll('[class*="message"], [class*="reply"], main [class*="block"]')]
    return msgs.length ? (msgs[msgs.length - 1].textContent ?? '') : ''
  })

  // 等待第一个 fence 渲染
  let blocks = 0
  for (let i = 0; i < 180; i++) {
    blocks = await genuiCount()
    if (blocks > 0) break
    await new Promise(r => setTimeout(r, 1000))
  }
  if (blocks === 0) {
    await page.screenshot({ path: join(process.cwd(), 'e2e-fail-timeout.png') })
    fail(`模型 180s 内未输出可渲染的 dsh-ui fence（pageerrors: ${pageErrors.slice(0, 3).join(' | ') || '无'}）`)
  }
  log(`✓ fence 渲染成功（${blocks} 个 data-genui 块）`)

  // 点击块内第一个按钮（action 回传）
  const beforeText = await lastText()
  const clicked = await page.evaluate(() => {
    const block = document.querySelector('[data-genui]')
    if (!block) return false
    const btn = block.querySelector('button')
    if (!btn) return false
    btn.click()
    return true
  })
  if (!clicked) fail('渲染块内未找到可点击按钮')
  log('已点击 action 按钮，等待模型响应...')

  // 等待模型收到 [genui-action] 并响应（新 fence 或回复文本变化）
  let responded = false
  for (let i = 0; i < 180; i++) {
    const [b2, t2] = await Promise.all([genuiCount(), lastText()])
    if (b2 !== blocks || t2 !== beforeText) { responded = true; blocks = b2; break }
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!responded) {
    await page.screenshot({ path: join(process.cwd(), 'e2e-fail-action-timeout.png') })
    fail('点击 action 后 180s 内模型无响应（事件循环未闭环）')
  }
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(process.cwd(), 'e2e-final.png') })
  log(`✓ 事件循环闭环（块数 ${blocks}，页面截图 e2e-final.png）`)
  console.log('PASS 真机 e2e 通过：安装 → 渲染 → action 回传 → 模型响应')
  await browser.close()
  await cleanup(KEEP)
  process.exit(0)
} catch (e) {
  console.error('✗ e2e 异常:', e)
  await cleanup(KEEP)
  process.exit(1)
}
