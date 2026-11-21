/**
 * Code blocks the reader can run, for a pandoc HTML page (styles in html-papers.css).
 * From https://github.com/mivanit/pandoc-utils, html-papers/.
 *
 *     <script src="run-code.js" defer
 *       data-run-pyodide="https://…/pyodide.mjs"></script>   where Python comes from (optional)
 *
 * Markup (html-papers.lua writes it from `run="driver.py"` on a code block):
 *
 *     <div class="run-block">
 *       <pre>…the code the page shows…</pre>
 *       <script type="application/json" class="run-data">
 *         {"main": "driver.py",                          the file that runs
 *          "files": [{"name": "driver.py", "text": "…"}, {"name": "model.py", "text": "…"}],
 *          "stdin": "…", "packages": ["…"], "render": "chips.js"}       all three optional
 *       </script>
 *     </div>
 *
 * The block gets a "Try it" button. It opens a panel in the side column (a note of popups.js;
 * under the block without it, or on a phone) and runs the code: the files, each editable, a
 * box for the input, Run, Stop, Reset, and the output. Ctrl/Cmd+Enter runs. Python files are
 * coloured as the page's listings are (pandoc's classes on a layer under the text being
 * typed), and long lines wrap. What the page shows and what runs are separate: `main` is
 * usually a small driver that reads the input, calls the code shown and prints.
 *
 * Python is Pyodide, in a worker, so a run can be stopped and the page stays live. Nothing is
 * fetched until "Try it" is first pressed; then Pyodide comes from a CDN (a few MB, cached by
 * the browser), with whatever the code imports that Pyodide ships (numpy, matplotlib, …).
 * `packages` are installed from PyPI. The files are written at their paths, under the folder
 * the code runs in, and `stdin` is its standard input. Every run starts the files afresh.
 *
 * The output is shown as printed: standard output, then standard error, then any matplotlib
 * figures still open when the code ends. Or a script of the page's own draws it: `render`
 * names it, and it calls
 *
 *     RunCode.render(function (result, el) { … });
 *
 * with `result = {stdout, stderr, exit, images, seconds, stdin}` (`images`: PNG data URLs) and
 * `el`, an empty element to fill. It is called after a run that ended without an error; after
 * any other, or if it throws, the output is shown as printed.
 *
 * `RunCode.interpreter` is what runs the code: `{run(job, on)}`, `job = {main, files, stdin,
 * packages}`, `on = {status(text), out(text), err(text), done({exit, images, seconds})}`,
 * returning `{stop()}`. Replace it to run something else (another language, a test's stub).
 *
 * The button and the panel are `data-doc-chrome`: not the document's text, to review.js.
 */
(function () {
  const CFG = (document.currentScript && document.currentScript.dataset) || {};
  const PYODIDE = CFG.runPyodide || 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/pyodide.mjs';
  const SHOWN = 200000;  // characters of output shown: a loop that prints forever must not fill the page

  function chrome(el) {
    el.setAttribute('data-doc-chrome', '');
    el.setAttribute('contenteditable', 'false');
    return el;
  }
  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // ---------------------------------------------------------------------------------------
  // Python: Pyodide in a worker. The worker's code is the function below, as text, after the
  // one import it needs; a worker made from a file would not start on a page opened from a
  // file, and Pyodide needs a module worker.

  // Run in Python, once: runs one file as a program and collects what it left.
  const HARNESS = String.raw`
import base64, importlib, io, os, runpy, sys, traceback, warnings

os.environ.setdefault("MPLBACKEND", "Agg")  # figures are collected below, not shown
sys.dont_write_bytecode = True  # edits can have the same size and timestamp as the last run
_RUN_DIR, _RUN_PATH = os.getcwd(), sys.path.copy()


def _run_code(main, stdin):
    os.chdir(_RUN_DIR)
    # Reload the paper's modules, including packages and imports from an earlier block.
    for name, module in list(sys.modules.items()):
        if (getattr(module, "__file__", None) or "").startswith(_RUN_DIR + os.sep):
            sys.modules.pop(name, None)
    importlib.invalidate_caches()
    here = os.path.dirname(os.path.abspath(main))  # as python does for a script
    sys.path[:] = [here, *_RUN_PATH]
    sys.stdin = io.StringIO(stdin)
    sys.argv = [main]
    code = 0
    try:
        runpy.run_path(main, run_name="__main__")
    except SystemExit as stop:
        if isinstance(stop.code, int):
            code = stop.code
        elif stop.code is not None:
            print(stop.code, file=sys.stderr)
            code = 1
    except BaseException as error:
        tb = error.__traceback__  # without this function's frame and runpy's
        while tb is not None and (tb.tb_frame.f_code is _run_code.__code__ or "runpy" in tb.tb_frame.f_code.co_filename):
            tb = tb.tb_next
        traceback.print_exception(type(error), error, tb)
        code = 1
    finally:
        os.chdir(_RUN_DIR)
        sys.path[:] = _RUN_PATH
    images = []
    pyplot = sys.modules.get("matplotlib.pyplot")
    if pyplot is not None:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            for number in pyplot.get_fignums():
                png = io.BytesIO()
                pyplot.figure(number).savefig(png, format="png", dpi=110, bbox_inches="tight")
                images.append("data:image/png;base64," + base64.b64encode(png.getvalue()).decode())
        pyplot.close("all")
    sys.stdout.flush()
    sys.stderr.flush()
    return code, images
`;

  // The worker. Messages in: a job. Out: {type: 'status' | 'out' | 'err', text}, then
  // {type: 'done', exit, images, seconds}.
  function workerMain(loadPyodide, harness) {
    const post = (message) => self.postMessage(message);
    const HOME = '/home/pyodide';  // where Pyodide starts: the code's working folder
    let ready = null;
    async function start() {
      const py = await loadPyodide();
      py.runPython(harness);
      return py;
    }
    // what Python writes, as it is written: bytes, decoded as they come
    function writer(type) {
      const decoder = new TextDecoder();
      return { write: (bytes) => { post({ type, text: decoder.decode(bytes, { stream: true }) }); return bytes.length; } };
    }
    self.onmessage = async (event) => {
      const job = event.data;
      try {
        if (!ready) { post({ type: 'status', text: 'Loading Python…' }); ready = start(); }
        let py;
        try { py = await ready; } catch (error) { ready = null; throw error; }  // the next Run tries again
        for (const file of job.files) {
          const at = file.name.lastIndexOf('/');
          if (at > 0) py.FS.mkdirTree(HOME + '/' + file.name.slice(0, at));
          py.FS.writeFile(HOME + '/' + file.name, file.text);
        }
        const said = {
          messageCallback: (text) => post({ type: 'status', text }),
          errorCallback: (text) => post({ type: 'err', text: text + '\n' }),
        };
        for (const file of job.files) if (file.name.endsWith('.py')) await py.loadPackagesFromImports(file.text, said);
        if (job.packages.length) {
          post({ type: 'status', text: 'Installing ' + job.packages.join(', ') + '…' });
          await py.loadPackage('micropip', said);
          const micropip = py.pyimport('micropip');
          await micropip.install(job.packages);
          micropip.destroy();
        }
        post({ type: 'status', text: 'Running…' });
        py.setStdout(writer('out'));
        py.setStderr(writer('err'));
        const began = performance.now();
        const run = py.globals.get('_run_code');
        const result = run(job.main, job.stdin);
        const [exit, images] = result.toJs();
        result.destroy();
        run.destroy();
        post({ type: 'done', exit, images, seconds: (performance.now() - began) / 1000 });
      } catch (error) {
        post({ type: 'err', text: String((error && error.message) || error) + '\n' });
        post({ type: 'done', exit: 1, images: [], seconds: 0 });
      }
    };
  }

  function pyodide(url) {
    const source = 'import { loadPyodide } from ' + JSON.stringify(url) + ';\n'
      + '(' + workerMain.toString() + ')(loadPyodide, ' + JSON.stringify(HARNESS) + ');\n';
    let worker = null;  // kept between runs: Python loads once
    return {
      run(job, on) {
        if (!worker) worker = new Worker('data:text/javascript;charset=utf-8,' + encodeURIComponent(source), { type: 'module' });
        const mine = worker;
        const gone = () => { mine.terminate(); if (worker === mine) worker = null; };
        mine.onmessage = (event) => {
          const m = event.data;
          if (m.type === 'done') on.done(m);
          else on[m.type](m.text);
        };
        mine.onerror = (event) => {
          event.preventDefault();
          gone();
          on.err('Python did not load' + (event.message ? ': ' + event.message : ' (is there a network connection?)') + '\n');
          on.done({ exit: 1, images: [], seconds: 0 });
        };
        mine.postMessage(job);
        return { stop: gone };  // the only way to stop Python mid-run: the next run loads it again (from the browser's cache)
      },
    };
  }

  // ---------------------------------------------------------------------------------------
  // Python, coloured: its text as html, each token in a span with the class pandoc gives that
  // kind in a listing, so the page's own highlighting colours it. Good enough to read by: a
  // string, a comment and a number are found exactly; a name is a keyword or a builtin by
  // being on a list.
  const WORDS = {
    im: 'import from',
    cf: 'if elif else for while break continue return yield try except finally raise with pass match case',
    kw: 'def class lambda and or not is in as global nonlocal assert del async await',
    va: 'True False None',
    bu: 'abs all any bool bytes callable chr dict dir divmod enumerate filter float format frozenset getattr hasattr hash input int isinstance issubclass iter len list map max min next object open ord pow print property range repr reversed round set setattr slice sorted str sum super tuple type vars zip self',
  };
  const KIND = new Map(Object.entries(WORDS).flatMap(([cls, words]) => words.split(' ').map((word) => [word, cls])));
  // a comment | a string (any prefix; one left open runs to the end of its line, or of the text
  // if triple-quoted) | a number | a decorator | a name
  const TOKEN = /(#.*)|((?:[rbfuRBFU]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?))|(\b0[xXoObB][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?)|(@[\w.]+)|([A-Za-z_]\w*)/g;
  const escaped = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function coloured(text) {
    let html = '', at = 0, naming = false;  // naming: the name after def or class
    for (const m of text.matchAll(TOKEN)) {
      let cls = m[1] ? 'co' : m[2] ? 'st' : m[3] ? (/^0[xXoObB]/.test(m[3]) || !/[.eE]/.test(m[3]) ? 'dv' : 'fl') : m[4] ? 'at' : KIND.get(m[0]);
      if (m[5] && naming) cls = 'fu';
      if (m[5]) naming = m[0] === 'def' || m[0] === 'class';
      html += escaped(text.slice(at, m.index)) + (cls ? '<span class="' + cls + '">' + escaped(m[0]) + '</span>' : escaped(m[0]));
      at = m.index + m[0].length;
    }
    return html + escaped(text.slice(at));
  }

  // ---------------------------------------------------------------------------------------
  // renderers: a script of the page's own, loaded when first needed, that calls RunCode.render
  const renderers = new Map(), loading = new Map();
  function renderer(src) {
    const url = new URL(src, document.baseURI).href;
    if (!loading.has(url)) {
      loading.set(url, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => (renderers.has(url) ? resolve(renderers.get(url)) : reject(new Error(src + ' did not call RunCode.render')));
        script.onerror = () => reject(new Error(src + ' could not be loaded'));
        document.head.append(script);
      }));
    }
    return loading.get(url);
  }

  const RunCode = window.RunCode = {
    interpreter: pyodide(PYODIDE),
    render(draw) {
      const script = document.currentScript;
      if (script && script.src) renderers.set(script.src, draw);
    },
  };

  // ---------------------------------------------------------------------------------------
  // the page
  let running = null;  // one run at a time: {stop()}

  function setup(block, index) {
    const holder = block.querySelector('script.run-data');
    if (!holder) return;
    const data = JSON.parse(holder.textContent);
    const original = new Map(data.files.map((file) => [file.name, file.text]));
    const texts = new Map(original);
    let shown = data.main;

    const opener = chrome(make('button', 'run-open', '▶ Try it'));
    opener.type = 'button';
    opener.title = 'Edit this code and run it here';
    block.append(opener);

    const panel = make('div', 'run-panel');
    const tabs = make('div', 'run-tabs');
    tabs.setAttribute('role', 'tablist');
    // The code: a box that scrolls, holding the text twice, one on the other. Under: the text
    // coloured. Over: the textarea, its own text clear, so what is typed shows in the colours
    // below. Both wrap alike and are as tall as the text, so only the box scrolls.
    const code = make('div', 'run-code');
    const under = make('pre', 'run-hl');
    under.setAttribute('aria-hidden', 'true');
    const tinted = make('code');
    under.append(tinted);
    const editor = make('textarea', 'run-editor');
    editor.setAttribute('aria-label', 'Code');
    code.append(under, editor);
    const stdin = make('textarea', 'run-stdin');
    stdin.rows = 2;
    stdin.value = data.stdin || '';
    for (const area of [editor, stdin]) {
      area.spellcheck = false;
      area.setAttribute('autocapitalize', 'off');
      area.setAttribute('autocomplete', 'off');
    }
    // the layer under the text, as the text is now (a last, empty line needs something on it)
    function tint() {
      const text = editor.value;
      tinted.innerHTML = (shown.endsWith('.py') ? coloured(text) : escaped(text)) + ' ';
    }
    editor.addEventListener('input', tint);
    const label = make('label', 'run-label', 'Input');
    label.append(stdin);
    const go = make('button', 'run-go', 'Run');
    const stop = make('button', 'run-stop', 'Stop');
    const reset = make('button', 'run-reset', 'Reset');
    reset.title = 'The code and the input as the page has them';
    for (const button of [go, stop, reset]) button.type = 'button';
    stop.hidden = true;
    const status = make('span', 'run-status');
    status.setAttribute('role', 'status');
    const bar = make('div', 'run-bar');
    bar.append(go, stop, reset, status);
    const result = make('div', 'run-result');
    result.setAttribute('aria-live', 'polite');
    panel.append(tabs, code, label, bar, result);

    function show(name) {
      texts.set(shown, editor.value);
      shown = name;
      editor.value = texts.get(name);
      tint();
      code.scrollTop = 0;
      for (const tab of tabs.children) tab.setAttribute('aria-selected', String(tab.dataset.name === name));
    }
    for (const file of data.files) {
      const tab = make('button', 'run-tab', file.name);
      tab.type = 'button';
      tab.dataset.name = file.name;
      tab.setAttribute('role', 'tab');
      tab.addEventListener('click', () => show(file.name));
      tabs.append(tab);
    }
    tabs.hidden = data.files.length < 2;
    editor.value = texts.get(shown);
    show(shown);

    // the output as printed: standard output, standard error, figures
    function printed(el, r) {
      el.textContent = '';
      const cut = (text) => (text.length > SHOWN ? text.slice(0, SHOWN) + '\n… (the rest is not shown)' : text);
      if (r.stdout) el.append(make('pre', 'run-stdout', cut(r.stdout)));
      if (r.stderr) el.append(make('pre', 'run-stderr', cut(r.stderr)));
      for (const src of r.images || []) { const img = make('img', 'run-image'); img.src = src; img.alt = 'A figure the code drew'; el.append(img); }
    }
    let mine = null;  // this panel's run, while it is going
    let latest = 0;  // delayed output belongs only to the latest run in this panel
    function ended(text) {
      mine = running = null;
      go.hidden = false;
      stop.hidden = true;
      status.textContent = text;
    }
    function run() {
      if (running) running.stop();
      const version = ++latest;
      texts.set(shown, editor.value);
      const r = { stdout: '', stderr: '', exit: null, images: [], seconds: 0, stdin: stdin.value };
      let frame = 0;
      const draw = () => { frame = 0; if (version === latest) printed(result, r); };
      const soon = () => { if (!frame) frame = requestAnimationFrame(draw); };  // at most once a frame
      result.textContent = '';
      go.hidden = true;
      stop.hidden = false;
      status.textContent = 'Starting…';
      const own = { stop: () => { handle.stop(); cancelAnimationFrame(frame); if (mine === own) ended('Stopped'); } };
      running = mine = own;  // before the interpreter is asked: it may answer at once
      const handle = RunCode.interpreter.run(
        { main: data.main, files: data.files.map((file) => ({ name: file.name, text: texts.get(file.name) })), stdin: stdin.value, packages: data.packages || [] },
        {
          status: (text) => { if (mine === own) status.textContent = text; },
          out: (text) => { if (mine === own) { r.stdout += text; if (!data.render) soon(); } },
          err: (text) => { if (mine === own) { r.stderr += text; soon(); } },
          done: (end) => {
            if (mine !== own) return;
            cancelAnimationFrame(frame);
            Object.assign(r, { exit: end.exit, images: end.images || [], seconds: end.seconds || 0 });
            ended(r.exit === 0 ? 'Ran in ' + (r.seconds < 10 ? r.seconds.toFixed(2) : Math.round(r.seconds)) + ' s' : 'Stopped with an error');
            printed(result, r);
            if (!data.render || r.exit !== 0) return;
            renderer(data.render).then((draw) => {
              if (version !== latest) return;
              const el = make('div', 'run-rendered');
              draw(r, el);
              result.textContent = '';
              result.append(el);
            }).catch((error) => {
              if (version !== latest) return;
              // the output stays as printed, with why it is not drawn
              result.append(make('pre', 'run-stderr', 'The output could not be drawn: ' + error.message));
            });
          },
        },
      );
    }
    go.addEventListener('click', run);
    stop.addEventListener('click', () => { if (mine) mine.stop(); });
    reset.addEventListener('click', () => {
      for (const [name, text] of original) texts.set(name, text);
      editor.value = texts.get(shown);
      tint();
      stdin.value = data.stdin || '';
    });
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); run(); return; }
      // Tab indents in the code; Shift+Tab, as everywhere, leaves the box
      if (event.key === 'Tab' && event.target === editor && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end');
        tint();
      }
    });

    // The panel: a note in the side column, or in the text on a phone (popups.js does both);
    // under the block on a page without popups.js. Closed, it keeps what was typed.
    const key = 'run:' + index;
    let note = null;
    function closed() {
      if (mine) mine.stop();
      latest++;
      const focused = panel.contains(document.activeElement);
      panel.remove();  // out of the note, to go into the next one
      opener.setAttribute('aria-expanded', 'false');
      if (focused) opener.focus({ preventScroll: true });
    }
    function close() {
      const n = note;
      note = null;
      if (n) window.MarginNotes.hide(key);
      closed();
    }
    function open() {
      if (window.MarginNotes) {
        note = window.MarginNotes.show(key, opener, '', { closable: true, cls: 'preview run-note', linked: true });
        note.append(panel);
        note.addEventListener('noteclose', () => { if (note) { note = null; closed(); } });  // its own ×
        window.MarginNotes.place();
      } else {
        chrome(panel);
        block.after(panel);
      }
      opener.setAttribute('aria-expanded', 'true');
      editor.focus({ preventScroll: true });
      run();  // what "Try it" asked for; the reader changes things and runs again
    }
    opener.setAttribute('aria-expanded', 'false');
    opener.addEventListener('click', () => (panel.isConnected ? close() : open()));
  }

  document.querySelectorAll('.run-block').forEach(setup);
})();
