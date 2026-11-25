try {
  var scheme = localStorage.getItem('color-scheme');
  if (scheme === 'light' || scheme === 'dark') {
    var meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = scheme;
  }
} catch (e) {}
