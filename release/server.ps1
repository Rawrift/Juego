$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:8765/")
$listener.Start()
Start-Process "http://127.0.0.1:8765/"
Write-Host "RIGYARD disponible en http://127.0.0.1:8765/ - Ctrl+C para cerrar."

$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json"; ".wasm"="application/wasm";
  ".glb"="model/gltf-binary"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".svg"="image/svg+xml"
}
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
    $path = Join-Path $root $rel
    $full = [IO.Path]::GetFullPath($path)
    if (-not $full.StartsWith([IO.Path]::GetFullPath($root))) {
      $ctx.Response.StatusCode = 403; $ctx.Response.Close(); continue
    }
    if (Test-Path $full -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $bytes = [IO.File]::ReadAllBytes($full)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  }
} finally { $listener.Stop(); $listener.Close() }
