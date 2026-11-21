-- A paper written once in markdown, built as HTML (for html-papers' scripts and stylesheets)
-- and as a PDF (through LaTeX). From https://github.com/mivanit/pandoc-utils, html-papers/.
--
--   filters: [html-papers.lua]          run pandoc with --number-sections --citeproc
--
-- What it does, in both outputs unless noted:
-- - Cross-references: `\autoref{sec:x}` to a heading, figure or table id reads "Section 2.1",
--   "Figure 3", "Table 1" (a heading at any level is a "Section"); `\ref{sec:x}` is the number
--   alone. LaTeX resolves them itself; in HTML they become links, and captions are numbered to
--   match. A caption may carry its id as `\label{...}`. An unknown id builds: in HTML as a red
--   ??id with a warning from this filter, in the PDF as LaTeX's own ??.
-- - Terms: metadata `terms: {name: {text, def, target}}` (e.g. in a terms.yaml given as a
--   metadata file) defines `\term{name}` and `\term[shown text]{name}`: the term's text, linked
--   to the id `target`, with `def` as a tooltip (HTML: the link's title, which popups.js shows
--   in the margin; PDF: a tooltip). An unknown name fails the build.
-- - Subfigures: `::: {#fig:x .subfigures}` holding captioned images then one caption paragraph
--   is one figure, images side by side as (a), (b), ...; each image keeps its own id.
-- - A figure of anything: `::: {#fig:x .figure}` holding blocks then one caption paragraph is
--   one numbered figure (a code listing with a caption, say).
-- - Tables: wrap a table in `::: {table-header-rows="1"}` to move that many leading body
--   rows into its header (a pipe table already has a one-row header). HTML: a footnote in a cell
--   becomes a `*` whose text popups.js shows in the margin; the PDF keeps the footnote.
-- - Live figures (HTML): `![caption](static.svg){#fig:x interactive-src="page.html"
--   interactive-height="400"}` shows the static image until clicked (live-figures.js). Also
--   `interactive-embed` (the page to frame, if not the same) and `interactive-width` (the
--   width that page is laid out for). For a live page too heavy to frame,
--   `interactive-link="page.html"` alone keeps the figure static with a link to the page under
--   it. The PDF ignores all five.
-- - Token rows: `::: {#fig:x .generations src="rows.json"}` holding one caption paragraph is a
--   numbered figure drawn from that file: a prompt, then a row per model, every token on its
--   own chip. The file is `{"prompt": [token, ...], "rows": [{"label": "...", "tokens": [...],
--   "end": "eos" | "cut" (optional), "reference": true (optional)}]}`. A term's text inside a
--   label becomes that term.
-- - Code that runs (HTML): a code block with `run="driver.py"` gets a Try it button
--   (run-code.js): the reader edits the code, gives it input and runs it in the page, in
--   Python (Pyodide, fetched when Try it is first pressed). The block shows its own code; the
--   file named by `run` is what runs, so the two can differ (a listing of a module, run
--   through a driver that reads the input and prints). `run=""`, or the class `.run`, runs
--   the block's own code. Also:
--     run-files="model.py data/words.txt"  files the code imports or reads
--     run-stdin="some text"                the input it starts with (`\n` is a new line),
--     run-stdin-file="in.txt"              or a file holding it
--     run-render="chips.js"                a script that draws the output (else it is shown as
--                                          printed, with any matplotlib figures under it)
--     run-packages="some-package"          packages from PyPI (what Pyodide ships, numpy or
--                                          matplotlib say, is loaded from the imports alone)
--     run-output="out.txt"                 what a run printed, made by the build: printed
--                                          under the block in both outputs
--   Every file is read at build time and put in the page, at its path relative to the
--   document, so the code that runs is the code the build read and needs no server. The PDF
--   shows the block and, with `run-output`, the output; it ignores the rest.
-- - `\TODO{...}`: red, in both.
-- - HTML head: the script tags, review.js's `review-doc-version`, and its Export > Email
--   recipient from metadata `review_email`. Metadata `html_papers_dir` is the scripts' URL
--   prefix (default: beside the page), and `pyodide_url` where run-code.js fetches Pyodide
--   (its `pyodide.mjs`; default: a pinned version on jsDelivr). All are read as markdown text:
--   write a value with `--` or `_` in backticks. The version is the environment variable DOC_VERSION if set (for a
--   build made away from its sources); else the git commit, with -dirty when a tracked file in
--   the document's folder, other than the page being written, is modified.
-- - HTML: a multi-line `date: |` becomes lines of one paragraph (the date, then notes).
PANDOC_VERSION:must_be_at_least('3.1.1')  -- pandoc.json

local HTML = FORMAT:match('html') ~= nil
local SCRIPTS = {'arxiv-links.js', 'popups.js', 'contents.js', 'live-figures.js', 'run-code.js', 'keep-place.js'}
local LAST_SCRIPT = 'menu.js'  -- after review.js: it lists what the others let the reader change

-- ---------------------------------------------------------------------------------------
-- live figures
local LIVE_ATTRS = {'interactive-src', 'interactive-height', 'interactive-embed', 'interactive-width',
  'interactive-link'}

local function live_figure(fig)
  local source, height, embed, width, link
  local image_count = 0
  fig = fig:walk({Image = function(img)
    image_count = image_count + 1
    if img.attributes['interactive-link'] then
      assert(not img.attributes['interactive-src'],
        'interactive-link keeps a figure static: leave out interactive-src, or leave out the link')
      link = img.attributes['interactive-link']
      for _, name in ipairs(LIVE_ATTRS) do img.attributes[name] = nil end
      return img
    end
    for _, name in ipairs({'interactive-height', 'interactive-embed', 'interactive-width'}) do
      assert(not img.attributes[name] or img.attributes['interactive-src'],
        name .. ' needs interactive-src, the live page: ' .. img.src)
    end
    if img.attributes['interactive-src'] then
      source = img.attributes['interactive-src']
      height = img.attributes['interactive-height'] or '600'
      embed = img.attributes['interactive-embed'] or source
      width = img.attributes['interactive-width']
      for _, name in ipairs(LIVE_ATTRS) do img.attributes[name] = nil end
      return img
    end
  end})
  if link then
    assert(image_count == 1, 'A figure with interactive-link must have exactly one static image')
    -- under the image, in the image's own block: a second block would be set beside it
    fig.content[1].content:extend({pandoc.LineBreak(), pandoc.Link({pandoc.Str('Open the interactive version ↗')},
      link, '', pandoc.Attr('', {'open-full'}, {{'target', '_blank'}, {'rel', 'noopener'}}))})
    return fig
  end
  if not source then return fig end
  assert(image_count == 1, 'An interactive figure must have exactly one static image')
  assert(height:match('^%d+$') and tonumber(height) > 0,
    'interactive-height must be a positive number of pixels')
  -- the static image shows until clicked, so nothing loads from the live page before that
  -- pairs in a list, not a table: a table's order changes from run to run, and with it the page
  local attrs = {{'data-embed', embed}, {'data-link', source}, {'data-height', height}}
  if width then attrs[#attrs + 1] = {'data-width', width} end
  fig.content = {pandoc.Div(fig.content, pandoc.Attr('', {'fig-static'}, attrs))}
  return fig
end

-- ---------------------------------------------------------------------------------------
-- figures made of blocks, and subfigures
local SUBFIGURES = {}  -- figure id -> its subfigures' ids, for HTML cross-references

local function figure_div(div)
  if not div.classes:includes('figure') then return end
  local caption = div.content[#div.content]
  assert(div.identifier ~= '' and #div.content >= 2 and caption.t == 'Para',
    '.figure div ' .. div.identifier .. ': needs an id, content, then a caption paragraph')
  -- one Div of content: pandoc sets two or more figure blocks side by side
  return pandoc.Figure({pandoc.Div({table.unpack(div.content, 1, #div.content - 1)})},
    {pandoc.Plain(caption.content)}, pandoc.Attr(div.identifier))
end

local function subfigures(div)
  if not div.classes:includes('subfigures') then return end
  local subs, caption = {}, nil
  for _, b in ipairs(div.content) do
    if b.t == 'Figure' then
      subs[#subs + 1] = b
    else
      assert(not caption and (b.t == 'Para' or b.t == 'Plain'),
        'subfigures: captioned images, then one caption paragraph')
      caption = b.content
    end
  end
  assert(#subs >= 2 and caption, 'subfigures ' .. div.identifier .. ' needs two images and a caption')
  local attr = pandoc.Attr(div.identifier)
  if not HTML then
    -- subcaption subfigures at an equal share of the line (pandoc's own nested figures take
    -- a fixed 0.45 each)
    local out = pandoc.Inlines({})
    for i, s in ipairs(subs) do
      if i > 1 then out:insert(pandoc.RawInline('latex', '\\hfill')) end
      out:insert(pandoc.RawInline('latex', string.format('\\begin{subfigure}[t]{%.3f\\linewidth}\\centering ', 0.98 / #subs)))
      for _, b in ipairs(s.content) do out:extend(b.content) end
      out:insert(pandoc.RawInline('latex', '\\caption{'))
      out:extend(pandoc.utils.blocks_to_inlines(s.caption.long))
      out:insert(pandoc.RawInline('latex', '}\\label{' .. s.identifier .. '}\\end{subfigure}'))
    end
    return pandoc.Figure({pandoc.Plain(out)}, {pandoc.Plain(caption)}, attr)
  end
  local row, ids = {}, {}
  for i, s in ipairs(subs) do
    ids[#ids + 1] = s.identifier
    local blocks = pandoc.Blocks(s.content)
    local cap = pandoc.Inlines({pandoc.Str('(' .. string.char(96 + i) .. ')'), pandoc.Space()})
    cap:extend(pandoc.utils.blocks_to_inlines(s.caption.long))
    blocks:insert(pandoc.Div({pandoc.Plain(cap)}, pandoc.Attr('', {'subcaption'})))
    row[#row + 1] = pandoc.Div(blocks, pandoc.Attr(s.identifier, {'subfigure'}))
  end
  SUBFIGURES[div.identifier] = ids
  return pandoc.Figure({pandoc.Div(row, pandoc.Attr('', {'subfigure-row'}))}, {pandoc.Plain(caption)}, attr)
end

-- ---------------------------------------------------------------------------------------
-- tables
local function table_headers(div)
  local count = div.attributes['table-header-rows']
  if not count then return end
  assert(count:match('^%d+$') and #div.content == 1 and div.content[1].t == 'Table',
    'table-header-rows needs a nonnegative integer and a div containing one table')
  local tbl = div.content[1]
  local body = tbl.bodies[1]
  count = tonumber(count)
  assert(count <= (body and #body.body or 0), 'table-header-rows exceeds the first table body')
  for _ = 1, count do
    tbl.head.rows:insert(body.body:remove(1))
  end
  div.content[1] = tbl
  div.attributes['table-header-rows'] = nil
  return div
end

local function table_notes(tbl)
  -- Captions keep ordinary numbered footnotes. Only notes inside cells become cell notes.
  local caption = tbl.caption
  tbl.caption = pandoc.Caption()
  tbl = tbl:walk({Note = function(note)
    return pandoc.Span({pandoc.Superscript({pandoc.Str('*')}),
      pandoc.Span(pandoc.utils.blocks_to_inlines(note.content), pandoc.Attr('', {'cell-note-body'}, {hidden = ''}))},
      pandoc.Attr('', {'cell-note'}))
  end})
  tbl.caption = caption
  return tbl
end

-- ---------------------------------------------------------------------------------------
-- terms
local TERMS = {}

local function read_terms(meta)
  for name, t in pairs(meta.terms or {}) do
    assert(name:match('^%a+$'), 'term names are letters only: ' .. name)
    assert(t.text and t.def and t.target, 'term ' .. name .. ' needs text, def and target')
    TERMS[name] = {
      text = pandoc.utils.stringify(t.text),
      def = pandoc.utils.stringify(t.def),
      target = pandoc.utils.stringify(t.target),
    }
  end
end

local TEX_SPECIAL = {['\\'] = '\\textbackslash{}', ['{'] = '\\{', ['}'] = '\\}',
  ['~'] = '\\textasciitilde{}', ['^'] = '\\textasciicircum{}'}

local function tex_escape(s)
  return (s:gsub('[\\{}%%#&_%$~^]', function(c) return TEX_SPECIAL[c] or ('\\' .. c) end))
end

-- The PDF's side: \term, \TODO, subcaption for subfigures, and the token chip.
local function latex_preamble()
  -- terms: body-text color with a faint dotted underline, not a colored link
  -- The tooltip is a form button over the term's link, and viewers that give form fields
  -- the click (Chrome, Acrobat) never reach the link under it: the button gets the same
  -- jump (GoTo the label's hyperref anchor), so a click works whichever one is hit.
  local lines = {'\\usepackage{xspace}', '\\usepackage{pdfcomment}', '\\usepackage[normalem]{ulem}',
    '\\usepackage{refcount}', '\\usepackage{subcaption}', '\\usepackage{xcolor}', '\\usepackage{array}',
    -- Keep ordinary chips intact; a token wider than its column can break between characters.
    '\\usepackage{iftex}',
    '\\definecolor{hptokbg}{HTML}{ECEEF1}',
    '\\newsavebox{\\hptokbox}',
    '\\newcommand{\\hptokchar}[1]{{\\setlength{\\fboxsep}{0pt}\\colorbox{hptokbg}{\\strut\\ttfamily #1}}\\allowbreak}',
    '\\newcommand{\\hptok}[2]{{\\setlength{\\fboxsep}{1.2pt}\\sbox{\\hptokbox}{\\strut\\ttfamily #1}'
      .. '\\ifdim\\wd\\hptokbox>\\dimexpr\\linewidth-2\\fboxsep\\relax #2'
      .. '\\else\\colorbox{hptokbg}{\\usebox{\\hptokbox}}\\fi}\\hspace{1.5pt}\\allowbreak}',
    -- Unsupported characters remain identifiable instead of aborting the PDF or disappearing.
    '\\newcommand{\\hpunicode}[2]{\\ifPDFTeX\\ifcsname u8:\\detokenize{#2}\\endcsname #2'
      .. '\\else\\texttt{[U+#1]}\\fi\\else\\iffontchar\\font"#1 #2\\else\\texttt{[U+#1]}\\fi\\fi}',
    '\\providecommand{\\TODO}[1]{{\\color{red}[TODO: #1]}}',
    -- \\autoref reads as on the web page: "Section 2.1", whatever the heading's level
    '\\AtBeginDocument{\\def\\sectionautorefname{Section}\\def\\subsectionautorefname{Section}'
      .. '\\def\\subsubsectionautorefname{Section}\\def\\paragraphautorefname{Section}'
      .. '\\def\\subparagraphautorefname{Section}}',
    '\\newcommand{\\hpdotuline}{\\bgroup\\markoverwith{\\textcolor{black!25}{\\rule[-0.45ex]{0.12ex}{0.12ex}}\\hskip0.35ex}\\ULon}',
    '\\makeatletter',
    '\\def\\hp@dest{}',
    '\\let\\hp@tooltipannot\\pc@annot@tooltip',
    '\\renewcommand{\\pc@annot@tooltip}{\\hp@tooltipannot\\ifx\\hp@dest\\@empty\\else'
      .. '/A << /S /GoTo /D (\\getrefbykeydefault{\\hp@dest}{anchor}{}) >>\\space\\fi}',
    '\\DeclareRobustCommand{\\hpterm}[3]{{\\def\\hp@dest{#1}\\pdftooltip{{\\hypersetup{linkcolor=.}\\hyperref[#1]{\\hpdotuline{#2}}}}{#3}}\\xspace}',
    -- \term[shown]{name}: hp@term@<name> takes the shown text; hp@termtext@<name> is the
    -- default, stored braced so one expansion hands it over as a single argument. Branches go
    -- through \@firstoftwo so no \fi is left for \hpterm's \xspace to see.
    '\\@ifdefinable{\\term}{\\DeclareRobustCommand{\\term}[2][]{\\@ifundefined{hp@term@#2}'
      .. '{\\PackageError{html-papers}{Unknown term \\detokenize{#2}}{Add it to the terms metadata}}'
      .. '{\\if\\relax\\detokenize{#1}\\relax\\expandafter\\@firstoftwo\\else\\expandafter\\@secondoftwo\\fi'
      .. '{\\expandafter\\expandafter\\expandafter\\hp@term@use\\csname hp@termtext@#2\\endcsname{#2}}'
      .. '{\\csname hp@term@#2\\endcsname{#1}}}}}',
    '\\def\\hp@term@use#1#2{\\csname hp@term@#2\\endcsname{#1}}'}
  local names = {}
  for name in pairs(TERMS) do names[#names + 1] = name end
  table.sort(names)
  for _, name in ipairs(names) do
    local t = TERMS[name]
    lines[#lines + 1] = '\\@namedef{hp@term@' .. name .. '}#1{\\hpterm{' .. t.target .. '}{#1}{'
      .. tex_escape(t.def) .. '}}'
    lines[#lines + 1] = '\\@namedef{hp@termtext@' .. name .. '}{{' .. tex_escape(t.text) .. '}}'
  end
  lines[#lines + 1] = '\\makeatother'
  return pandoc.RawBlock('latex', table.concat(lines, '\n'))
end

-- `\term[shown]{name}` -> (name, shown or nil, tail); nil when raw is not a \term.
-- An unknown name is an error (both builds call this).
local function parse_term(raw)
  local rest = raw.text:match('^\\term(.*)$')
  if not rest or rest:match('^%a') then return nil end
  rest = rest:gsub('^%s+', '')
  local shown = rest:match('^(%b[])')
  if shown then rest = rest:sub(#shown + 1) end
  local braced = rest:match('^(%b{})')
  assert(braced, 'expected \\term[shown]{name}: ' .. raw.text)
  local name, tail = braced:sub(2, -2), rest:sub(#braced + 1)
  assert(tail:match('^%s*$'), 'unexpected text after \\term: ' .. raw.text)
  if not TERMS[name] then error('unknown term \\term{' .. name .. '}, not in the terms metadata: ' .. raw.text, 0) end
  return name, shown, tail
end

local WARNED = {}

local function warn(key, message)
  if WARNED[key] then return end
  WARNED[key] = true
  io.stderr:write('\n!!! WARNING: ' .. message .. '\n\n')
end

-- `\term[shown]{name}` -> link; nil when raw is not a term.
local function term_link(raw, targets)
  local name, shown, tail = parse_term(raw)
  if not name then return nil end
  local t = TERMS[name]
  -- its section went away: the term still shows (and defines), its link leads nowhere
  if not targets[t.target] then warn('term:' .. name, 'term ' .. name .. ' links to unknown target ' .. t.target) end
  local inlines = shown
    and pandoc.utils.blocks_to_inlines(pandoc.read(shown:sub(2, -2), 'markdown').blocks)
    or {pandoc.Str(t.text)}
  local out = pandoc.List({pandoc.Link(inlines, '#' .. t.target, t.def, pandoc.Attr('', {'term'}))})
  if tail ~= '' then out:insert(pandoc.Space()) end
  return out
end

-- ---------------------------------------------------------------------------------------
-- token rows
-- A label with any term's text in it, that text made the term, as if written
-- `\term[shown]{name}`. The longest term wins; a term matches whole words only, in any case.
local TERM_ORDER

local function label_inlines(label)
  if not TERM_ORDER then
    TERM_ORDER = {}
    for name, t in pairs(TERMS) do TERM_ORDER[#TERM_ORDER + 1] = {name = name, lower = t.text:lower()} end
    table.sort(TERM_ORDER, function(a, b) return #a.lower > #b.lower or (#a.lower == #b.lower and a.name < b.name) end)
  end
  local function word(c) return c:match('^%w$') ~= nil end
  local lower, out, i, plain = label:lower(), pandoc.Inlines({}), 1, 1
  while i <= #label do
    local hit
    for _, t in ipairs(TERM_ORDER) do
      local j = i + #t.lower - 1
      if lower:sub(i, j) == t.lower and not word(label:sub(i - 1, i - 1)) and not word(label:sub(j + 1, j + 1)) then
        hit = t
        break
      end
    end
    if hit then
      out:extend(pandoc.Inlines(label:sub(plain, i - 1)))
      local shown, term = label:sub(i, i + #hit.lower - 1), TERMS[hit.name]
      out:insert(HTML and pandoc.Link({pandoc.Str(shown)}, '#' .. term.target, term.def, pandoc.Attr('', {'term'}))
        or pandoc.RawInline('tex', '\\term[' .. tex_escape(shown) .. ']{' .. hit.name .. '}'))
      i = i + #hit.lower
      plain = i
    else
      i = i + 1
    end
  end
  out:extend(pandoc.Inlines(label:sub(plain)))
  return out
end

-- `::: {#fig:x .generations src="rows.json"}` holding a caption paragraph: the prompt, then one
-- row per model, every token on its own chip. A newline is a ↵ chip and, after some text, a
-- line break, so code keeps its lines; a row's end shows whether the model stopped (end of
-- text) or the row was cut (…). The row marked `reference` is set apart.
local function generations(div)
  if not div.classes:includes('generations') then return end
  local src, caption = div.attributes.src, div.content[1]
  assert(div.identifier ~= '' and src and #div.content == 1 and caption.t == 'Para',
    'generations ' .. div.identifier .. ': needs an id, src="<json>", then a caption paragraph')
  local f = assert(io.open(src, 'r'), 'generations ' .. div.identifier .. ': cannot read ' .. src)
  local ok, data = pcall(pandoc.json.decode, f:read('a'), false)
  f:close()
  local function need(condition, what)
    if not condition then error('generations ' .. div.identifier .. ': ' .. src .. ': ' .. what, 0) end
  end
  local function tokens_of(list, where)
    need(type(list) == 'table', where .. ' needs a list of tokens')
    for _, t in ipairs(list) do need(type(t) == 'string', where .. ': every token is a string') end
    return list
  end
  need(ok and data ~= nil, 'not valid JSON')
  need(type(data) == 'table' and type(data.rows) == 'table', 'needs "prompt" and "rows"')
  tokens_of(data.prompt, '"prompt"')
  for i, r in ipairs(data.rows) do
    local where = 'row ' .. i
    need(type(r) == 'table' and type(r.label) == 'string', where .. ' needs a "label"')
    tokens_of(r.tokens, where .. ' "tokens"')
    need(r['end'] == nil or r['end'] == 'eos' or r['end'] == 'cut', where .. ': "end" is "eos" or "cut"')
    need(r.reference == nil or type(r.reference) == 'boolean', where .. ': "reference" is true or false')
  end
  local function esc(s) return (s:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;')) end
  -- a token for LaTeX exactly as it is: pandoc's own escaping of code, which also keeps
  -- typewriter text from joining -- or '' into other characters
  local function tex_code(s)
    if s == '' then return '' end
    return (pandoc.write(pandoc.Pandoc({pandoc.Plain({pandoc.Code(s)})}), 'latex'):gsub('%s+$', ''))
  end
  local NL_TEX = '{\\color{gray}$\\hookleftarrow$}'
  local function pdf_token(s)
    local whole, pieces, ascii = {}, {}, {}
    local function flush()
      if #ascii > 0 then whole[#whole + 1] = tex_code(table.concat(ascii)); ascii = {} end
    end
    for _, cp in utf8.codes(s) do
      local char = utf8.char(cp)
      local rendered
      if cp == 0xE000 then rendered = NL_TEX
      elseif cp > 127 then rendered = '\\hpunicode{' .. string.format('%04X', cp) .. '}{' .. char .. '}'
      else rendered = tex_code(char) end
      if cp < 128 then ascii[#ascii + 1] = char else flush(); whole[#whole + 1] = rendered end
      pieces[#pieces + 1] = '\\hptokchar{' .. rendered .. '}'
    end
    flush()
    return '\\hptok{' .. table.concat(whole) .. '}{' .. table.concat(pieces) .. '}'
  end
  -- the chips of one token list, and its end marker, as html or latex
  local function chips(tokens, finish)
    local out, seen = {}, false
    for _, t in ipairs(tokens) do
      local nl = t:find('\n', 1, true)
      local shown = t:gsub('\n', '\u{E000}')  -- a newline, until it is drawn as ↵
      if HTML then
        out[#out + 1] = '<span class="tok' .. (t:match('^%s*$') and nl and ' tok-nl' or '') .. '">'
          .. esc(shown):gsub('\u{E000}', '<span class="nl">↵</span>') .. '</span>'
      else
        out[#out + 1] = pdf_token(shown)
      end
      -- a newline breaks the line once there is text before it (this token's counts)
      seen = seen or t:match('%S') ~= nil
      if nl and seen then out[#out + 1] = HTML and '<br>' or '\\newline ' end
    end
    if finish == 'eos' then
      out[#out + 1] = HTML and '<span class="tok-end">end of text</span>' or '{\\color{gray}\\textit{\\small end of text}}'
    elseif finish == 'cut' then
      out[#out + 1] = HTML and '<span class="tok-end">…</span>' or '{\\color{gray}\\ldots}'
    end
    return table.concat(out)
  end
  local rows = {{label = pandoc.Inlines({pandoc.Emph({pandoc.Str('prompt')})}), text = chips(data.prompt), cls = 'gen-prompt'}}
  for _, r in ipairs(data.rows) do
    rows[#rows + 1] = {label = label_inlines(r.label), text = chips(r.tokens, r['end']),
      cls = r.reference == true and 'gen-ref' or nil}
  end
  local blocks
  if HTML then
    local list = {}
    for _, r in ipairs(rows) do
      list[#list + 1] = pandoc.Div({pandoc.Div({pandoc.Plain(r.label)}, pandoc.Attr('', {'gen-label'})),
        pandoc.Div({pandoc.RawBlock('html', r.text)}, pandoc.Attr('', {'gen-text'}))},
        pandoc.Attr('', {'gen-row', r.cls}))
    end
    blocks = {pandoc.Div(list, pandoc.Attr('', {'generations'}))}
  else
    -- one Plain: a blank line between blocks would end a paragraph inside the tabular
    local tab = pandoc.Inlines({pandoc.RawInline('latex',
      '{\\small\\noindent\\begin{tabular}{@{}>{\\raggedleft\\arraybackslash}p{0.22\\linewidth}'
      .. '@{\\hspace{0.8em}}>{\\raggedright\\arraybackslash}p{\\dimexpr0.78\\linewidth-0.8em\\relax}@{}}\n')})
    for k, r in ipairs(rows) do
      tab:extend(r.cls == 'gen-ref' and {pandoc.Emph(r.label)} or r.label)
      tab:insert(pandoc.RawInline('latex', ' & ' .. r.text .. (k < #rows and (k == 1 and ' \\\\[0.5em]\n' or ' \\\\[0.3em]\n') or '\n')))
    end
    tab:insert(pandoc.RawInline('latex', '\\end{tabular}\\par}'))
    blocks = {pandoc.Plain(tab)}
  end
  return pandoc.Figure(blocks, {pandoc.Plain(caption.content)}, pandoc.Attr(div.identifier))
end

-- ---------------------------------------------------------------------------------------
-- Code that runs: `run="driver.py"` (or `.run`, or `run=""`: the block's own code) on a code
-- block. HTML: the block, then the files it needs as JSON for run-code.js, in one div. Both
-- outputs: the block without those attributes, and under it what `run-output` names.
local RUN_ATTRS = {'run', 'run-files', 'run-stdin', 'run-stdin-file', 'run-render', 'run-packages', 'run-output'}

local function run_code(cb)
  local a = cb.attributes
  local own = cb.classes:includes('run') or a.run == ''
  if not own and not a.run then
    for _, name in ipairs(RUN_ATTRS) do
      assert(not a[name], 'a code block with ' .. name .. ' needs run="<file>" (or .run, to run its own code)')
    end
    return
  end
  local what = 'code block with run' .. (own and '' or '="' .. a.run .. '"')
  local function need(condition, message)
    if not condition then error(what .. ': ' .. message, 0) end
  end
  local function read(path, attr)
    -- in the page a file keeps its path, under the folder the code runs in
    need(not path:match('^/') and not path:match('^%a:') and not ('/' .. path .. '/'):find('/../', 1, true),
      attr .. ' "' .. path .. '" must be a path below the document')
    local f = io.open(path, 'r')
    need(f, attr .. ': cannot read ' .. path)
    local text = f:read('a')
    f:close()
    return text
  end
  need(not (own and a.run and a.run ~= ''), 'either .run (its own code) or run="<file>", not both')
  need(not (a['run-stdin'] and a['run-stdin-file']), 'run-stdin or run-stdin-file, not both')
  local main = own and 'main.py' or a.run
  local files = {{name = main, text = own and cb.text or read(a.run, 'run')}}
  for path in (a['run-files'] or ''):gmatch('%S+') do
    need(path ~= main, 'run-files names ' .. path .. ', which is the file that runs')
    files[#files + 1] = {name = path, text = read(path, 'run-files')}
  end
  local stdin = a['run-stdin-file'] and read(a['run-stdin-file'], 'run-stdin-file')
    or (a['run-stdin'] or ''):gsub('\\n', '\n')
  local output = a['run-output'] and read(a['run-output'], 'run-output')
  local data = {main = main, files = files, stdin = stdin}
  if a['run-render'] then data.render = a['run-render'] end
  local packages = {}
  for name in (a['run-packages'] or ''):gmatch('%S+') do packages[#packages + 1] = name end
  if #packages > 0 then data.packages = packages end

  for _, name in ipairs(RUN_ATTRS) do a[name] = nil end
  cb.classes = cb.classes:filter(function(c) return c ~= 'run' end)
  local blocks = {cb}
  if HTML then
    -- Escape every '<': '<!-- <script>' also changes HTML's script parsing state.
    blocks[#blocks + 1] = pandoc.RawBlock('html', '<script type="application/json" class="run-data">'
      .. pandoc.json.encode(data):gsub('<', '\\u003c') .. '</script>')
  end
  if output then
    if not HTML then blocks[#blocks + 1] = pandoc.RawBlock('latex', '\\noindent{\\small\\textit{Output:}}') end
    blocks[#blocks + 1] = pandoc.CodeBlock((output:gsub('\n+$', '')), pandoc.Attr('', {'run-output'}))
  end
  if HTML then return pandoc.Div(blocks, pandoc.Attr('', {'run-block'})) end
  return blocks
end

-- ---------------------------------------------------------------------------------------
-- The version review.js stamps exported comments with: the environment variable DOC_VERSION
-- if set (a build made away from its sources says what it was built from); else HEAD's
-- commit, with -dirty when a tracked file in the document's folder is modified. The page being
-- written does not count (it is an output, and often tracked), nor does a deleted file (a
-- build that starts by clearing its folder). '' outside a git checkout.
local function git(command)
  local ok, handle = pcall(io.popen, 'git ' .. command .. ' 2>/dev/null')
  if not ok or not handle then return nil end
  local out = handle:read('a')
  return handle:close() and out or nil
end

local function doc_version()
  local given = os.getenv('DOC_VERSION')
  if given and given ~= '' then return given end
  local sha = git('rev-parse HEAD')
  if not sha then return '' end
  sha = sha:gsub('%s+$', '')
  local output = (PANDOC_STATE.output_file or ''):match('[^/\\]*$')
  for line in (git('status --porcelain --untracked-files=no -- .') or ''):gmatch('[^\n]+') do
    local status, path = line:sub(1, 2), line:sub(4):gsub('^"(.*)"$', '%1')
    if not status:find('D') and path:match('[^/]*$') ~= output then return sha .. '-dirty' end
  end
  return sha
end

local function meta_string(meta, key)
  return meta[key] and pandoc.utils.stringify(meta[key]) or ''
end

-- text for an HTML attribute's value
local function attribute(s)
  return (s:gsub('&', '&amp;'):gsub('"', '&quot;'):gsub('<', '&lt;'))
end

local function add_header(meta, blocks)
  local includes = meta['header-includes']
  if includes == nil then
    includes = pandoc.List()
  elseif pandoc.utils.type(includes) ~= 'List' then
    includes = pandoc.List({includes})
  end
  includes:insert(pandoc.MetaBlocks(blocks))
  meta['header-includes'] = includes
end

function Pandoc(doc)
  read_terms(doc.meta)
  doc = doc:walk({CodeBlock = run_code})
  if HTML then doc = doc:walk({Figure = live_figure}) end
  doc = doc:walk({Div = subfigures})
  doc = doc:walk({Div = figure_div})
  doc = doc:walk({Div = generations})
  doc = doc:walk({Div = table_headers})

  if not HTML then
    -- check term names here too, so a typo fails with its name rather than a LaTeX error
    local function check(raw) parse_term(raw) end
    doc:walk({RawInline = check, RawBlock = check})
    add_header(doc.meta, {latex_preamble()})
    -- never fetch a live figure's page during a PDF build
    return doc:walk({Image = function(img)
      for _, name in ipairs(LIVE_ATTRS) do img.attributes[name] = nil end
      return img
    end})
  end

  -- The head. Any header-includes of the document's own are the PDF's preamble (LaTeX): the
  -- HTML's are replaced by the scripts.
  local dir, email, version = attribute(meta_string(doc.meta, 'html_papers_dir')),
    attribute(meta_string(doc.meta, 'review_email')), attribute(doc_version())
  local pyodide = attribute(meta_string(doc.meta, 'pyodide_url'))
  local head = {}
  for _, name in ipairs(SCRIPTS) do
    local more = name == 'run-code.js' and pyodide ~= '' and (' data-run-pyodide="' .. pyodide .. '"') or ''
    head[#head + 1] = pandoc.RawBlock('html', '<script src="' .. dir .. name .. '"' .. more .. ' defer></script>')
  end
  head[#head + 1] = pandoc.RawBlock('html', '<script src="' .. dir .. 'review.js"'
    .. (email ~= '' and (' data-review-email="' .. email .. '"') or '') .. ' defer></script>')
  head[#head + 1] = pandoc.RawBlock('html', '<script src="' .. dir .. LAST_SCRIPT .. '" defer></script>')
  if version ~= '' then
    head[#head + 1] = pandoc.RawBlock('html', '<meta name="review-doc-version" content="' .. version .. '">')
  end
  doc.meta['header-includes'] = pandoc.MetaBlocks(head)

  local targets = {}  -- id -> what \autoref reads: "Section 2.1", "Figure 3"
  local numbers = {}  -- id -> what \ref reads: "2.1", "3" (an unnumbered heading: its title)
  local sections = {0, 0, 0, 0, 0, 0}
  local figures, tables = 0, 0

  local function caption_target(el, label)
    -- a caption may carry its id as \label{...}; native {#fig:...} ids work too
    el.caption.long = pandoc.walk_block(pandoc.Div(el.caption.long), {
      RawInline = function(raw)
        local id = raw.format == 'tex' and raw.text:match('^\\label{([^}]+)}$')
        if id then
          assert(el.identifier == '' or el.identifier == id, 'Conflicting caption labels')
          el.identifier = id
          return {}
        end
      end,
    }).content
    if el.identifier ~= '' then targets[el.identifier], numbers[el.identifier] = label, label:match('%S+$') end
    local first = el.caption.long[1]
    if first and (first.t == 'Plain' or first.t == 'Para') then
      first.content:insert(1, pandoc.Space())
      first.content:insert(1, pandoc.Str(label .. ':'))
    end
    return el
  end

  -- collect every target before resolving references, so forward references work
  doc = doc:walk({
    Header = function(header)
      if header.classes:includes('unnumbered') then
        targets[header.identifier] = pandoc.utils.stringify(header.content)
        numbers[header.identifier] = targets[header.identifier]
      else
        sections[header.level] = sections[header.level] + 1
        for i = header.level + 1, 6 do sections[i] = 0 end
        numbers[header.identifier] = table.concat(sections, '.', 1, header.level)
        targets[header.identifier] = 'Section ' .. numbers[header.identifier]
      end
    end,
    Figure = function(fig)
      figures = figures + 1
      for i, id in ipairs(SUBFIGURES[fig.identifier] or {}) do
        numbers[id] = figures .. string.char(96 + i)
        targets[id] = 'Figure ' .. numbers[id]
      end
      return caption_target(fig, 'Figure ' .. figures)
    end,
    Table = function(tbl)
      if #tbl.caption.long > 0 then
        tables = tables + 1
        return caption_target(tbl, 'Table ' .. tables)
      end
    end,
  })

  local function tex_inline(raw)
    if raw.format ~= 'tex' and raw.format ~= 'latex' then return end
    local term = term_link(raw, targets)
    if term then return term end
    local id, bare = raw.text:match('^\\autoref{([^}]+)}$'), raw.text:match('^\\ref{([^}]+)}$')
    id = id or bare
    if id then
      -- a label that went away while the text is being restructured: build anyway, like
      -- LaTeX's "??", with a red placeholder and a warning naming it
      if not targets[id] then
        warn('ref:' .. id, 'Unknown cross-reference: ' .. id .. ' (shown as a red ??)')
        return pandoc.Span({pandoc.Str('??' .. id)}, pandoc.Attr('', {'todo'}))
      end
      return pandoc.Link(bare and numbers[id] or targets[id], '#' .. id)
    end
    -- a \TODO macro defined in the front matter arrives already expanded by pandoc
    local todo = raw.text:match('^{\\color{red}%[TODO: (.*)%]}$') or raw.text:match('^\\TODO{(.*)}$')
    if todo then
      local blocks = pandoc.read('[TODO: ' .. todo .. ']', 'markdown').blocks
      return pandoc.Span(pandoc.utils.blocks_to_inlines(blocks), pandoc.Attr('', {'todo'}))
    end
  end

  -- a multi-line `date: |` is one paragraph; as inlines, pandoc's <p class="date"> holds no
  -- nested <p> (which browsers split off, unstyled). Lines end with `\ ` in the front matter.
  local date = doc.meta.date
  if date and pandoc.utils.type(date) == 'Blocks' and #date == 1 and date[1].content then
    local lines, line = {}, pandoc.Inlines({})
    for _, el in ipairs(date[1].content) do
      if el.t == 'LineBreak' then lines[#lines + 1], line = line, pandoc.Inlines({}) else line:insert(el) end
    end
    lines[#lines + 1] = line
    local rest = pandoc.Inlines({})
    for _, l in ipairs(lines) do
      -- trailing spaces, including the non-breaking one that ends each front-matter line
      while #l > 0 and pandoc.utils.stringify(l[#l]):match('^[%s\u{A0}]*$') do l:remove() end
      if #l > 0 then
        if #rest > 0 then rest:insert(pandoc.LineBreak()) end
        rest:extend(l)
      end
    end
    doc.meta.date = pandoc.MetaInlines(rest)
  end

  doc = doc:walk({Table = table_notes})
  doc = doc:walk({
    RawInline = tex_inline,
    RawBlock = function(raw)
      local inline = tex_inline(raw)
      -- Plain, not Para: a table cell holding only \term{x} is a RawBlock, and a <p> there
      -- adds margins that misalign the row
      if inline then return pandoc.Plain(inline.t and {inline} or inline) end
    end,
  })
  return doc:walk({Image = function(img)
    assert(not img.attributes['interactive-src'] and not img.attributes['interactive-link'],
      'interactive-src and interactive-link require a standalone image with a nonempty caption')
  end})
end
