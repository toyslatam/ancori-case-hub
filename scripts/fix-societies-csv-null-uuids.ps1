# Convierte el texto literal "NULL" en celdas vacías en columnas UUID opcionales
# de Sociedades.csv (evita ERROR 22P02 al importar en Supabase).
#
# Uso (PowerShell):
#   .\scripts\fix-societies-csv-null-uuids.ps1 -Path "C:\ruta\Sociedades.csv"
#
# Salida por defecto: Sociedades_fixed.csv junto al archivo original.

param(
  [Parameter(Mandatory = $true)]
  [string] $Path,
  [string] $OutPath = ""
)

if (-not (Test-Path -LiteralPath $Path)) {
  Write-Error "No existe el archivo: $Path"
  exit 1
}

if (-not $OutPath) {
  $dir = Split-Path -Parent $Path
  $base = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  $ext = [System.IO.Path]::GetExtension($Path)
  $OutPath = Join-Path $dir ($base + "_fixed" + $ext)
}

$optionalUuidCols = @("presidente_id", "tesorero_id", "secretario_id")
$rows = Import-Csv -LiteralPath $Path -Encoding UTF8

$i = 0
foreach ($r in $rows) {
  $i++
  foreach ($c in $optionalUuidCols) {
    $prop = $r.PSObject.Properties[$c]
    if ($null -eq $prop) { continue }
    $v = [string]$prop.Value
    if ($v -match "^(?i)null$") {
      $prop.Value = ""
    }
  }
  $cid = $r.PSObject.Properties["client_id"]
  if ($null -ne $cid) {
    $cv = [string]$cid.Value
    if ($cv -match "^(?i)null$" -or [string]::IsNullOrWhiteSpace($cv)) {
      Write-Warning "Fila $i : client_id es obligatorio; no puede ser NULL vacío. Corrige antes de importar."
    }
  }
}

$rows | Export-Csv -LiteralPath $OutPath -NoTypeInformation -Encoding UTF8
Write-Host "Listo: $OutPath ($($rows.Count) filas)"
