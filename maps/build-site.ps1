# Builds the GitHub Pages site in ..\docs from the Indonesia 26SJO02CI-T pages.
# docs\index.html (hub) is hand-written; this script copies the linked pages,
# re-encodes embedded PNG data URIs as JPEG and adds a link back to the hub.
param([int]$Quality = 85)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
$docs = Join-Path (Split-Path $root -Parent) 'docs'
$pages = @(
    'tpe-cgk-walkthrough.html'
    'jakarta-yogyakarta-walkthrough-v2.html'
    'yogyakarta-surabaya-walkthrough.html'
    'sub-dps-walkthrough.html'
    'dps-tpe-walkthrough.html'
    'indonesia-26SJO02CI-T-transport-guide.html'
    'indonesia-26SJO02CI-T-transport-quick.html'
)

$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$encoderParams = [Drawing.Imaging.EncoderParameters]::new(1)
$encoderParams.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$toJpeg = {
    param($match)
    $bytes = [Convert]::FromBase64String($match.Groups[1].Value)
    $src = [IO.MemoryStream]::new($bytes)
    $image = [Drawing.Image]::FromStream($src)
    # Flatten onto white so transparent areas do not turn black.
    $flat = [Drawing.Bitmap]::new($image.Width, $image.Height)
    $g = [Drawing.Graphics]::FromImage($flat)
    $g.Clear([Drawing.Color]::White)
    $g.DrawImage($image, 0, 0, $image.Width, $image.Height)
    $out = [IO.MemoryStream]::new()
    $flat.Save($out, $codec, $encoderParams)
    $g.Dispose(); $flat.Dispose(); $image.Dispose(); $src.Dispose()
    $jpeg = $out.ToArray(); $out.Dispose()
    if ($jpeg.Length -lt $bytes.Length) { 'data:image/jpeg;base64,' + [Convert]::ToBase64String($jpeg) } else { $match.Value }
}

$backLink = '<p style="margin:0;padding:10px 16px;background:#087e83;font:15px/1.5 sans-serif"><a href="index.html" style="color:#fff">&larr; 回印尼全覽 26SJO02CI-T 總覽</a></p>'

New-Item -ItemType Directory -Force -Path $docs | Out-Null
foreach ($name in $pages) {
    $html = [IO.File]::ReadAllText((Join-Path $root $name))
    $before = [Text.Encoding]::UTF8.GetByteCount($html)
    $html = [regex]::Replace($html, 'data:image/png;base64,([A-Za-z0-9+/=]+)', $toJpeg)
    $body = [regex]::Match($html, '<body[^>]*>')
    if (-not $body.Success) { throw "No <body> in $name" }
    $html = $html.Insert($body.Index + $body.Length, $backLink)
    [IO.File]::WriteAllText((Join-Path $docs $name), $html, [Text.UTF8Encoding]::new($false))
    $after = [Text.Encoding]::UTF8.GetByteCount($html)
    Write-Host ('{0}: {1:N1} MB -> {2:N1} MB' -f $name, ($before / 1MB), ($after / 1MB))
}

New-Item -ItemType File -Force -Path (Join-Path $docs '.nojekyll') | Out-Null
if (-not (Test-Path (Join-Path $docs 'index.html'))) { Write-Warning 'docs\index.html (hub) is missing.' }
