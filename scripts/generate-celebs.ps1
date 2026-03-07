$ErrorActionPreference = "Stop"

$userAgent = @{ "User-Agent" = "facemash-bot/2026 (known living profiles)" }
$limit = 500
$maxOffset = 4000
$sitelinksMin = 30

$continentByQid = @{
  "Q15" = "africa"
  "Q48" = "asia"
  "Q46" = "europe"
  "Q49" = "north-america"
  "Q18" = "south-america"
  "Q538" = "oceania"
}

$occupationQids = @(
  "Q82594",    # computer scientist
  "Q82955",    # politician
  "Q6831",     # billionaire
  "Q2066131",  # athlete
  "Q43845",    # businessperson
  "Q131524",   # entrepreneur
  "Q2906862",  # influencer
  "Q2045208",  # internet celebrity
  "Q17125263", # YouTuber
  "Q57414145", # online streamer
  "Q50279140"  # Twitch streamer
)

$genderMap = @{
  "Q6581097" = "male"
  "Q6581072" = "female"
}

function Invoke-Sparql {
  param([string]$Query)

  $encoded = [uri]::EscapeDataString($Query)
  $url = "https://query.wikidata.org/sparql?format=json&query=$encoded"

  for ($try = 1; $try -le 5; $try++) {
    try {
      $res = Invoke-RestMethod -Uri $url -Headers $userAgent -TimeoutSec 120
      return $res.results.bindings
    } catch {
      if ($try -eq 5) {
        return @()
      }
      Start-Sleep -Seconds (2 * $try)
    }
  }
}

function Build-OccupationQuery {
  param([string]$GenderQid, [string]$OccupationQid, [int]$Offset)

@"
SELECT DISTINCT ?item ?itemLabel ?image ?country ?countryLabel ?sitelinks WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P21 wd:$GenderQid;
        wdt:P18 ?image;
        wdt:P27 ?country;
        wdt:P106 wd:$OccupationQid;
        wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks >= $sitelinksMin)
  FILTER NOT EXISTS { ?item wdt:P570 ?deathDate. }
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT $limit
OFFSET $Offset
"@
}

function Build-PresidentQuery {
  param([string]$GenderQid, [int]$Offset)

@"
SELECT DISTINCT ?item ?itemLabel ?image ?country ?countryLabel ?sitelinks WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P21 wd:$GenderQid;
        wdt:P18 ?image;
        wdt:P27 ?country;
        wdt:P39 wd:Q30461;
        wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks >= $sitelinksMin)
  FILTER NOT EXISTS { ?item wdt:P570 ?deathDate. }
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT $limit
OFFSET $Offset
"@
}

function Add-Rows {
  param([System.Collections.Generic.Dictionary[string, object]]$Store, [array]$Rows, [string]$Gender)

  foreach ($row in $Rows) {
    if (-not $row.item.value -or -not $row.itemLabel.value -or -not $row.image.value -or -not $row.country.value) { continue }

    $id = ($row.item.value -split '/')[-1]
    $countryId = ($row.country.value -split '/')[-1]
    $countryName = if ($row.countryLabel.value) { $row.countryLabel.value } else { $countryId }

    $sitelinks = 0
    if ($row.sitelinks.value) { $sitelinks = [int]$row.sitelinks.value }

    if (-not $Store.ContainsKey($id)) {
      $Store[$id] = [pscustomobject]@{
        id = $id
        name = $row.itemLabel.value
        image = ($row.image.value -replace '^http:', 'https:')
        gender = $Gender
        countryId = $countryId
        countryName = $countryName
        sitelinks = $sitelinks
      }
    } elseif ($sitelinks -gt $Store[$id].sitelinks) {
      $Store[$id].sitelinks = $sitelinks
    }
  }
}

function Invoke-WikidataClaims {
  param([string[]]$Ids)

  $joined = ($Ids -join '|')
  $url = "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=$joined"

  for ($try = 1; $try -le 4; $try++) {
    try {
      return Invoke-RestMethod -Uri $url -TimeoutSec 120
    } catch {
      if ($try -eq 4) { return $null }
      Start-Sleep -Seconds (2 * $try)
    }
  }
}

$store = New-Object 'System.Collections.Generic.Dictionary[string, object]'

foreach ($genderQid in $genderMap.Keys) {
  $genderName = $genderMap[$genderQid]

  foreach ($occ in $occupationQids) {
    for ($offset = 0; $offset -le $maxOffset; $offset += $limit) {
      $query = Build-OccupationQuery -GenderQid $genderQid -OccupationQid $occ -Offset $offset
      $rows = Invoke-Sparql -Query $query
      if (-not $rows.Count) { break }

      Add-Rows -Store $store -Rows $rows -Gender $genderName
      Start-Sleep -Milliseconds 300
    }
  }

  for ($offset = 0; $offset -le $maxOffset; $offset += $limit) {
    $query = Build-PresidentQuery -GenderQid $genderQid -Offset $offset
    $rows = Invoke-Sparql -Query $query
    if (-not $rows.Count) { break }

    Add-Rows -Store $store -Rows $rows -Gender $genderName
    Start-Sleep -Milliseconds 300
  }
}

$raw = $store.Values
if (-not $raw.Count) {
  throw "No profiles fetched from Wikidata."
}

$countryIds = $raw | Select-Object -ExpandProperty countryId -Unique
$countryMeta = @{}

for ($i = 0; $i -lt $countryIds.Count; $i += 45) {
  $end = [Math]::Min($i + 44, $countryIds.Count - 1)
  $chunk = $countryIds[$i..$end]

  $response = Invoke-WikidataClaims -Ids $chunk
  if (-not $response) { continue }

  foreach ($prop in $response.entities.PSObject.Properties) {
    $countryId = $prop.Name
    $entity = $prop.Value

    if (-not $entity.claims) { continue }

    $continentSlug = $null
    if ($entity.claims.P30) {
      foreach ($statement in $entity.claims.P30) {
        $continentQid = $statement.mainsnak.datavalue.value.id
        if ($continentQid -and $continentByQid.ContainsKey($continentQid)) {
          $continentSlug = $continentByQid[$continentQid]
          break
        }
      }
    }

    $iso2 = $null
    if ($entity.claims.P297) {
      $iso2 = $entity.claims.P297[0].mainsnak.datavalue.value
      if ($iso2) { $iso2 = $iso2.ToLower() }
    }

    if ($continentSlug) {
      $countryMeta[$countryId] = [pscustomobject]@{
        continent = $continentSlug
        iso2 = $iso2
      }
    }
  }

  Start-Sleep -Milliseconds 200
}

$final = foreach ($row in $raw) {
  if (-not $countryMeta.ContainsKey($row.countryId)) { continue }

  [pscustomobject]@{
    id = $row.id
    name = $row.name
    image = $row.image
    gender = $row.gender
    continent = $countryMeta[$row.countryId].continent
    countryId = $row.countryId
    countryName = $row.countryName
    countryCode = $countryMeta[$row.countryId].iso2
    score = 1200
    sitelinks = $row.sitelinks
  }
}

$final = $final |
  Sort-Object continent, countryName, gender, @{Expression='sitelinks';Descending=$true}, name |
  ForEach-Object {
    [pscustomobject]@{
      id = $_.id
      name = $_.name
      image = $_.image
      gender = $_.gender
      continent = $_.continent
      countryId = $_.countryId
      countryName = $_.countryName
      countryCode = $_.countryCode
      score = $_.score
    }
  }

$final | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 "celebs.json"

$contStats = $final | Group-Object continent | Sort-Object Name | ForEach-Object { "{0}:{1}" -f $_.Name, $_.Count }
"total=$($final.Count)" | Write-Output
"male=$((($final | Where-Object gender -eq 'male').Count)) female=$((($final | Where-Object gender -eq 'female').Count))" | Write-Output
"continents=" + ($contStats -join ",") | Write-Output




