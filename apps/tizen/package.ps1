param(
    [string]$CertificateProfile = $env:TIZEN_CERTIFICATE_PROFILE
)

$ErrorActionPreference = 'Stop'
$TizenCommand = Get-Command tizen -ErrorAction SilentlyContinue
if (-not $TizenCommand) { throw 'Instale Tizen Studio com Samsung TV Extension, Certificate Extension e Web CLI; depois reabra o PowerShell.' }
if (-not $CertificateProfile) { throw 'Defina TIZEN_CERTIFICATE_PROFILE com o nome do perfil ativo no Certificate Manager ou passe -CertificateProfile.' }

$ProjectRoot = $PSScriptRoot
Push-Location $ProjectRoot
try {
    npm --prefix ../web run build
    if ($LASTEXITCODE -ne 0) { throw 'O build web falhou.' }
    node .\prepare-assets.cjs
    if ($LASTEXITCODE -ne 0) { throw 'A preparação dos assets Tizen falhou.' }
    tizen build-web -out .buildResult -- .
    if ($LASTEXITCODE -ne 0) { throw 'O build Tizen falhou.' }
    tizen package -t wgt -s $CertificateProfile -- .buildResult
    if ($LASTEXITCODE -ne 0) { throw 'A assinatura/geração do WGT falhou. Confira o perfil ativo e os certificados no Tizen Studio.' }
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot '.buildResult') -Filter '*.wgt' -File -ErrorAction SilentlyContinue
}
finally { Pop-Location }
