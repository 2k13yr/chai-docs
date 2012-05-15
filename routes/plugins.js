var filtr = require('filtr')
  , fs = require('fs')
  , join = require('path').join
  , highlight = require('highlight.js')
  , marked = require('marked')
  , plugins = require('../plugins')
  , request = require('superagent');

var site_tags = []
  , plugin_tags = {};

plugins.forEach(function (plug) {
  if (!plug.tags || !Array.isArray(plug.tags)) return;
  plug.tags.forEach(function (tag) {
    if (!~site_tags.indexOf(tag)) site_tags.push(tag);
  });
});

function sortAlpha (a, b) {
  if ('object' === typeof a) a = a.name;
  if ('object' === typeof b) b = b.name;
  var A = a.toLowerCase()
    , B = b.toLowerCase();
  if (A < B) return -1;
  else if (A > B) return 1;
  else return 0;
};

site_tags.sort(sortAlpha);

site_tags.forEach(function (tag) {
  var query = filtr({ 'tags': { $all: [ tag ] } })
    , res = query.test(plugins).sort(sortAlpha);
  plugin_tags[tag] = res;
});

var site_locals = JSON.parse(fs.readFileSync(join(__dirname, '..', 'data', 'codex.json'))).locals;

app.get('/plugins', function (req, res) {
  var locals = {
      site: site_locals
    , plugin_tags: plugin_tags
    , plugins: plugins
    , file: {
          template: 'plugins'
        , href: '/plugins/'
        , title: 'Chai Plugins'
      }
  }
  res.render('plugins', locals);
});

app.get('/plugins/tags.json', function (req, res) {
  var json = {};
  for (var name in plugin_tags) {
    json[name] = [];
    plugin_tags[name].forEach(function (plugin) {
      json[name].push(plugin.url);
    });
  }
  res.json(json);
});

app.get('/plugins/:id', function (req, res, next) {
  var query = filtr({ 'url': req.params.id })
    , plugin = query.test(plugins)[0];

  if (!plugin) return next();

  var pkg = null
    , html = null;

  function render () {
    if (!pkg || !html) return;
    res.render('plugins/plugin', {
        site: site_locals
      , plugin: {
            spec: plugin
          , pkg: pkg
          , html: html
        }
      , file: {
          template: 'plugin'
        , href: '/plugins/' + req.params.id
        , title: plugin.name
      }
    });
  }

  if (!plugin.cache)
    plugin.cache = {};

  if (!plugin.cache.html) {
    request
      .get(plugin.markdown)
      .end(function (readme) {
        try {
          html = (readme.status == 200)
            ? parseMarkdown(readme.text)
            : '<p>No information provided.</p>'
        } catch (ex) {
          html = '<p>Error parsing markdown.</p>';
        }
        plugin.cache.html = html;
        plugin.cache.date = new Date();
        render();
      });
  } else {
    html = plugin.cache.html;
    render();
  }

  if (!plugin.cache.pkg) {
    request
      .get(plugin.pkg)
      .end(function (pack) {
        if (pack.status == 200) {
          try {
            pkg = JSON.parse(pack.text);
          } catch (ex) {
            pkg = { error: 2 }
          }
        } else {
          pkg = { error: 1 };
        }
        plugin.cache.pkg = pkg;
        plugin.cache.date = new Date();
        render();
      });
  } else {
    pkg = plugin.cache.pkg;
    render();
  }
});


function parseMarkdown (text) {
  var tokens = marked.lexer(text)
    , l = tokens.length
    , token;

  for (var i = 0; i < l; i++) {
    token = tokens[i];
    if (token.type == 'code') {
      var lang = token.lang || 'javascript';
      if (lang == 'js') lang = 'javascript';
      token.text = highlight.highlight(lang, token.text).value;
      token.escaped = true;
    }
  }

  text = marked.parser(tokens);
  return text;
};
