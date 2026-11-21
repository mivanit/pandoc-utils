// Draws what continue_text.py prints (one JSON object: the prompt, and a row of words for each
// model) as the paper draws its own continuations: every word on a chip. run-code.js calls the
// function given to RunCode.render with the run's result and an empty element.
RunCode.render(function (result, el) {
  const data = JSON.parse(result.stdout);
  const row = (label, tokens, cls, none) => {
    const line = document.createElement('div');
    line.className = 'gen-row' + (cls ? ' ' + cls : '');
    const name = document.createElement('div');
    name.className = 'gen-label';
    name.textContent = label;
    const text = document.createElement('div');
    text.className = 'gen-text';
    for (const token of tokens) {
      const chip = document.createElement('span');
      chip.className = 'tok';
      chip.textContent = token;
      text.append(chip);
    }
    if (!tokens.length) {
      const end = document.createElement('span');
      end.className = 'tok-end';
      end.textContent = none;
      text.append(end);
    }
    line.append(name, text);
    return line;
  };
  const rows = document.createElement('div');
  rows.className = 'generations';
  rows.append(row('prompt', data.prompt, 'gen-prompt', 'no words'));
  for (const r of data.rows) rows.append(row(r.label, r.tokens, '', 'never saw these words together'));
  el.append(rows);
});
