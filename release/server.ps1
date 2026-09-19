param(
    [switch]$NoBrowser,
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootWithSep = $root.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Get-MimeType([string]$Path) {
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { "text/html; charset=utf-8" }
        ".js"   { "text/javascript; charset=utf-8" }
        ".mjs"  { "text/javascript; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".wasm" { "application/wasm" }
        ".glb"  { "model/gltf-binary" }
        ".gltf" { "model/gltf+json" }
        ".png"  { "image/png" }
        ".jpg"  { "image/jpeg" }
        ".jpeg" { "image/jpeg" }
        ".svg"  { "image/svg+xml" }
        ".ico"  { "image/x-icon" }
        default { "application/octet-stream" }
    }
}

function Write-Response(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$Status,
    [string]$Reason,
    [byte[]]$Body,
    [string]$ContentType = "text/plain; charset=utf-8",
    [bool]$HeadOnly = $false
) {
    if ($null -eq $Body) { $Body = [byte[]]::new(0) }
    $headers = "HTTP/1.1 $Status $Reason`r`n" +
               "Content-Type: $ContentType`r`n" +
               "Content-Length: $($Body.Length)`r`n" +
               "Cache-Control: no-cache`r`n" +
               "Connection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $HeadOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

$listener = $null
$selectedPort = $null

foreach ($candidate in $Port..($Port + 20)) {
    try {
        $attempt = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidate)
        $attempt.Start()
        $listener = $attempt
        $selectedPort = $candidate
        break
    } catch {
        try { $attempt.Stop() } catch {}
    }
}

if ($null -eq $listener) {
    Write-Host ""
    Write-Host "RIGYARD no pudo abrir un puerto local entre $Port y $($Port + 20)." -ForegroundColor Red
    Write-Host "Cerra otros servidores locales o reinicia Windows y volve a intentar." -ForegroundColor Yellow
    exit 2
}

$url = "http://127.0.0.1:$selectedPort/"
Write-Host ""
Write-Host "  RIGYARD" -ForegroundColor Cyan
Write-Host "  Servidor listo en $url" -ForegroundColor Green
Write-Host "  Esta ventana debe permanecer abierta mientras jugas." -ForegroundColor DarkGray
Write-Host "  Ctrl+C para cerrar." -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
    try { Start-Process $url } catch {
        Write-Host "Abri manualmente: $url" -ForegroundColor Yellow
    }
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.NoDelay = $true
            $stream = $client.GetStream()
            $stream.ReadTimeout = 10000
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 8192, $true)

            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                $client.Close()
                continue
            }

            while ($true) {
                $line = $reader.ReadLine()
                if ($null -eq $line -or $line.Length -eq 0) { break }
            }

            $parts = $requestLine.Split(" ")
            if ($parts.Length -lt 2) {
                Write-Response $stream 400 "Bad Request" ([Text.Encoding]::UTF8.GetBytes("Bad Request"))
                continue
            }

            $method = $parts[0].ToUpperInvariant()
            $headOnly = $method -eq "HEAD"
            if ($method -ne "GET" -and -not $headOnly) {
                Write-Response $stream 405 "Method Not Allowed" ([Text.Encoding]::UTF8.GetBytes("Method Not Allowed"))
                continue
            }

            $target = $parts[1]
            $pathOnly = ($target -split "\?", 2)[0]
            $relative = [Uri]::UnescapeDataString($pathOnly.TrimStart("/"))
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }

            $candidatePath = [IO.Path]::GetFullPath((Join-Path $root $relative))
            $insideRoot = $candidatePath.Equals($root, [StringComparison]::OrdinalIgnoreCase) -or
                          $candidatePath.StartsWith($rootWithSep, [StringComparison]::OrdinalIgnoreCase)

            if (-not $insideRoot) {
                Write-Response $stream 403 "Forbidden" ([Text.Encoding]::UTF8.GetBytes("Forbidden"))
                continue
            }

            if (Test-Path $candidatePath -PathType Leaf) {
                $bytes = [IO.File]::ReadAllBytes($candidatePath)
                Write-Response $stream 200 "OK" $bytes (Get-MimeType $candidatePath) $headOnly
            } else {
                Write-Response $stream 404 "Not Found" ([Text.Encoding]::UTF8.GetBytes("Not Found"))
            }
        } catch {
            try {
                if ($client.Connected) {
                    $msg = [Text.Encoding]::UTF8.GetBytes("Internal Server Error")
                    Write-Response $client.GetStream() 500 "Internal Server Error" $msg
                }
            } catch {}
        } finally {
            try { $client.Close() } catch {}
        }
    }
} finally {
    try { $listener.Stop() } catch {}
}
