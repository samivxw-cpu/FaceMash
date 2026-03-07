$ErrorActionPreference = "Stop"

$targetPerGender = 5000
$rawTargetPerGender = 7500
$userAgent = @{ "User-Agent" = "facemash-bot/2026 (training project)" }

$continentByQid = @{
  "Q15" = "africa"
  "Q48" = "asia"
  "Q46" = "europe"
  "Q49" = "north-america"
  "Q18" = "south-america"
  "Q538" = "oceania"
}

$occupationQids = @(
  "Q33999",
  "Q177220",
  "Q4610556",
  "Q2066131",
  "Q2526255",
  "Q947873",
  "Q245068",
  "Q601156",
  "Q639669",
  "Q10800557",
  "Q937857",
  "Q3665646",
  "Q15981151",
  "Q18814623"
)

function Invoke-Sparql {
  param([string]$Query)

  $encoded = [uri]::EscapeDataString($Query)
  $url = "https://query.wikidata.org/sparql?format=json&query=$encoded"

  for ($try = 1; $try -le 4; $try++) {
    try {
      $res = Invoke-RestMethod -Uri $url -Headers $userAgent -TimeoutSec 140
      return $res.results.bindings
    } catch {
      if ($try -eq 4) { throw }
      Start-Sleep -Seconds (2 * $try)
    }
  }
}

function Build-QueryByOccupation {
  param(
    [string]$GenderQid,
    [string]$OccupationQid,
    [int]$Limit,
    [int]$Offset
  )

@"
SELECT DISTINCT ?item ?itemLabel ?image ?country WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P21 wd:$GenderQid;
        wdt:P18 ?image;
        wdt:P27 ?country;
        wdt:P106 wd:$OccupationQid.
  FILTER NOT EXISTS { ?item wdt:P570 ?d. }
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT $Limit
OFFSET $Offset
"@
}

function Build-QueryFallback {
  param(
    [string]$GenderQid,
    [int]$Limit,
    [int]$Offset
  )

@"
SELECT DISTINCT ?item ?itemLabel ?image ?country WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P21 wd:$GenderQid;
        wdt:P18 ?image;
        wdt:P27 ?country.
  FILTER NOT EXISTS { ?item wdt:P570 ?d. }
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT $Limit
OFFSET $Offset
"@
}

function Add-Rows {
  param(
    [System.Collections.Generic.Dictionary[string, object]]$Store,
    [array]$Rows,
    [string]$Gender
  )

  foreach ($row in $Rows) {
    if (-not $row.item.value -or -not $row.itemLabel.value -or -not $row.image.value -or -not $row.country.value) { continue }

    $id = ($row.item.value -split '/')[-1]
    $countryId = ($row.country.value -split '/')[-1]

    if (-not $Store.ContainsKey($id)) {
      $Store[$id] = [pscustomobject]@{
        id = $id
        name = $row.itemLabel.value
        image = ($row.image.value -replace '^http:', 'https:')
        gender = $Gender
        countryId = $countryId
      }
    }
  }
}

function Collect-Gender {
  param([string]$GenderQid, [string]$GenderName)

  $store = New-Object 'System.Collections.Generic.Dictionary[string, object]'

  foreach ($occ in $occupationQids) {
    if ($store.Count -ge $rawTargetPerGender) { break }

    $q = Build-QueryByOccupation -GenderQid $GenderQid -OccupationQid $occ -Limit 1600 -Offset 0
    $rows = Invoke-Sparql -Query $q
    Add-Rows -Store $store -Rows $rows -Gender $GenderName
    Start-Sleep -Milliseconds 450
  }

  $offset = 0
  while ($store.Count -lt $rawTargetPerGender -and $offset -le 22000) {
    $q = Build-QueryFallback -GenderQid $GenderQid -Limit 2000 -Offset $offset
    $rows = Invoke-Sparql -Query $q
    if (-not $rows.Count) { break }

    Add-Rows -Store $store -Rows $rows -Gender $GenderName
    $offset += 2000
    Start-Sleep -Milliseconds 500
  }

  return $store
}

function Invoke-WikidataClaims {
  param([string[]]$Ids)

  $joined = ($Ids -join '|')
  $url = "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=$joined"

  for ($try = 1; $try -le 4; $try++) {
    try {
      return Invoke-RestMethod -Uri $url -TimeoutSec 120
    } catch {
      if ($try -eq 4) { throw }
      Start-Sleep -Seconds (2 * $try)
    }
  }
}

$maleStore = Collect-Gender -GenderQid "Q6581097" -GenderName "male"
$femaleStore = Collect-Gender -GenderQid "Q6581072" -GenderName "female"

$rawAll = @($maleStore.Values + $femaleStore.Values)
$countryIds = $rawAll | Select-Object -ExpandProperty countryId -Unique

$countryToContinent = @{}
for ($i = 0; $i -lt $countryIds.Count; $i += 45) {
  $end = [Math]::Min($i + 44, $countryIds.Count - 1)
  $chunk = $countryIds[$i..$end]

  $response = Invoke-WikidataClaims -Ids $chunk
  foreach ($prop in $response.entities.PSObject.Properties) {
    $countryId = $prop.Name
    $entity = $prop.Value

    if (-not $entity.claims -or -not $entity.claims.P30) { continue }

    $continentId = $null
    foreach ($statement in $entity.claims.P30) {
      $cid = $statement.mainsnak.datavalue.value.id
      if ($cid) {
        $continentId = $cid
        break
      }
    }

    if ($continentId -and $continentByQid.ContainsKey($continentId)) {
      $countryToContinent[$countryId] = $continentByQid[$continentId]
    }
  }

  Start-Sleep -Milliseconds 250
}

$enriched = foreach ($row in $rawAll) {
  if (-not $countryToContinent.ContainsKey($row.countryId)) { continue }

  [pscustomobject]@{
    id = $row.id
    name = $row.name
    image = $row.image
    gender = $row.gender
    continent = $countryToContinent[$row.countryId]
    score = 1200
  }
}

$male = $enriched | Where-Object gender -eq "male" | Sort-Object name | Select-Object -First $targetPerGender
$female = $enriched | Where-Object gender -eq "female" | Sort-Object name | Select-Object -First $targetPerGender

if ($male.Count -lt $targetPerGender -or $female.Count -lt $targetPerGender) {
  throw "Insufficient living profiles after continent mapping (male=$($male.Count), female=$($female.Count))."
}

$final = @($male + $female)
$final | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 "celebs.json"

$contStats = $final | Group-Object continent | Sort-Object Name | ForEach-Object { "{0}:{1}" -f $_.Name, $_.Count }
"male=$($male.Count) female=$($female.Count) total=$($final.Count)" | Write-Output
"continents=" + ($contStats -join ",") | Write-Output
