param(
    [string]$CertificateProfile = $env:TIZEN_CERTIFICATE_PROFILE,
    [string]$TizenStudioRoot = $env:TIZEN_STUDIO_ROOT
)

$ErrorActionPreference = 'Stop'
$TizenCli = $null
if ($TizenStudioRoot) {
    $Candidate = Join-Path $TizenStudioRoot 'tools\ide\bin\tizen.bat'
    if (Test-Path -LiteralPath $Candidate) { $TizenCli = $Candidate }
}
if (-not $TizenCli -and (Test-Path -LiteralPath 'C:\tizen-studio\tools\ide\bin\tizen.bat')) { $TizenCli = 'C:\tizen-studio\tools\ide\bin\tizen.bat' }
if (-not $TizenCli) {
    $TizenCommand = Get-Command tizen -ErrorAction SilentlyContinue
    if ($TizenCommand) { $TizenCli = $TizenCommand.Source }
}
if (-not $TizenCli) { throw 'Não encontrei tizen.bat. Passe -TizenStudioRoot "PASTA_DO_TIZEN_STUDIO" ou defina TIZEN_STUDIO_ROOT.' }
if (-not $CertificateProfile) { throw 'Defina TIZEN_CERTIFICATE_PROFILE com o nome do perfil ativo no Certificate Manager ou passe -CertificateProfile.' }

$ProjectRoot = $PSScriptRoot
Push-Location $ProjectRoot
try {
    npm --prefix ../web run build
    if ($LASTEXITCODE -ne 0) { throw 'O build web falhou.' }
    node .\prepare-assets.cjs
    if ($LASTEXITCODE -ne 0) { throw 'A preparação dos assets Tizen falhou.' }
    & $TizenCli build-web -out .buildResult -- .
    if ($LASTEXITCODE -ne 0) { throw 'O build Tizen falhou.' }
    & $TizenCli package -t wgt -s $CertificateProfile -- .buildResult
    if ($LASTEXITCODE -ne 0) { throw 'A assinatura/geração do WGT falhou. Confira o perfil ativo e os certificados no Tizen Studio.' }
    Get-ChildItem -LiteralPath (Join-Path $ProjectRoot '.buildResult') -Filter '*.wgt' -File -ErrorAction SilentlyContinue
}
finally { Pop-Location }
