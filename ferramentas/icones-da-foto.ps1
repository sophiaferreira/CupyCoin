# Transforma a foto da capa nos ícones do CupyCoin (PNG quadrados de 180, 192 e 512 pixels).
# Rode no PowerShell, dentro da pasta do app:
#   powershell -ExecutionPolicy Bypass -File ferramentas\icones-da-foto.ps1
# Para trocar a capa: coloque outra foto na pasta do app e mude o nome em $foto abaixo.

param(
  [string]$foto = "Olhos de Gatinho com Moedas - 2.jpeg"
)

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$caminhoFoto = Join-Path $raiz $foto
if (-not (Test-Path $caminhoFoto)) { Write-Error "Não achei a foto: $caminhoFoto"; exit 1 }

$imagem = [System.Drawing.Image]::FromFile($caminhoFoto)
try {
  # Recorta o maior quadrado possível, centralizado (a moeda fica no meio da foto).
  $lado = [Math]::Min($imagem.Width, $imagem.Height)
  $x = [int](($imagem.Width - $lado) / 2)
  $y = [int](($imagem.Height - $lado) / 2)
  $recorte = New-Object System.Drawing.Rectangle $x, $y, $lado, $lado

  foreach ($tamanho in 180, 192, 512) {
    $icone = New-Object System.Drawing.Bitmap $tamanho, $tamanho
    $g = [System.Drawing.Graphics]::FromImage($icone)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $destino = New-Object System.Drawing.Rectangle 0, 0, $tamanho, $tamanho
    $g.DrawImage($imagem, $destino, $recorte, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $saida = Join-Path $raiz "public\icone-$tamanho.png"
    $icone.Save($saida, [System.Drawing.Imaging.ImageFormat]::Png)
    $icone.Dispose()
    Write-Host "icone-$tamanho.png criado"
  }
} finally {
  $imagem.Dispose()
}
