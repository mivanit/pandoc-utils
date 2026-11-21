// a renderer for the tests: what run-code.js gives it, in a form a test can read
RunCode.render(function (result, el) {
  el.textContent = 'drawn: ' + result.stdout.trim().toUpperCase() + ' (exit ' + result.exit + ', input ' + result.stdin + ')';
});
