import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const code = ts.transpileModule(readFileSync('src/lib/razorpay-client.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
let script, appended = 0, timeout
function makeScript () {
  const listeners = new Map()
  return { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), remove: () => { script = null }, emit: name => listeners.get(name)?.() }
}
const window = { setTimeout: fn => { timeout = fn; return 1 }, clearTimeout: () => {} }
const exports = {}
vm.runInNewContext(code, { exports, window, document: { querySelector: () => script, createElement: makeScript, body: { appendChild: value => { script = value; appended++ } } }, process: { env: {} } })
script = makeScript() // A stale script whose load/error events have already fired.
const stale = exports.loadRazorpayScript()
timeout()
assert.equal(await stale, false)
assert.equal(script, null)
const retry = exports.loadRazorpayScript()
assert.equal(exports.loadRazorpayScript(), retry)
assert.equal(appended, 1)
window.Razorpay = function () {}
script.emit('load')
assert.equal(await retry, true)
assert.equal(await exports.loadRazorpayScript(), true)
delete window.Razorpay
script = null
const failed = exports.loadRazorpayScript()
script.emit('error')
assert.equal(await failed, false)
assert.equal(script, null)
console.log('PASS: stale-script timeout, clean retry, shared load, successful SDK, network failure')
let sdkOptions, failureHandler, receivedFailure, dismissed = false
window.Razorpay = function (options) {
  sdkOptions = options
  this.on = (event, handler) => { if (event === 'payment.failed') failureHandler = handler }
  this.open = () => {}
}
await exports.openRazorpayCheckout({ key: 'rzp_test_fixture', amount: 79900, currency: 'INR', name: 'Test', order_id: 'order_fixture', onFailure: error => { receivedFailure = error }, modal: { ondismiss: () => { dismissed = true } } })
const providerError = { error: { reason: 'international_transaction_not_allowed', description: 'Domestic cards only' } }
failureHandler(providerError)
assert.equal(receivedFailure, providerError)
assert.equal(dismissed, false)
assert.equal(sdkOptions.onFailure, undefined)
console.log('PASS: provider failure reaches checkout with its original reason')
