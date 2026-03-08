$ErrorActionPreference = "Stop"

$userAgent = @{ "User-Agent" = "facemash-bot/2026 (known living global profiles)" }
$targetCount = 5000
$limit = 900
$maxOffset = 54000
$sitelinksMin = 45
$generalSitelinksMin = 70
$generalMaxOffset = 72000

$continentByQid = @{
  "Q15" = "africa"
  "Q48" = "asia"
  "Q46" = "europe"
  "Q49" = "north-america"
  "Q18" = "south-america"
  "Q538" = "oceania"
}

$occupationQids = @(
  "Q33999",    # actor
  "Q10800557", # film actor
  "Q177220",   # singer
  "Q133311",   # rapper
  "Q639669",   # musician
  "Q488111",   # songwriter
  "Q189290",   # producer
  "Q2526255",  # film director
  "Q36180",    # writer
  "Q1930187",  # journalist
  "Q947873",   # tv presenter
  "Q245068",   # comedian
  "Q937857",   # football player
  "Q3665646",  # basketball player
  "Q10833314", # tennis player
  "Q10841764", # Formula One driver
  "Q131524",   # entrepreneur
  "Q43845",    # businessperson
  "Q6831",     # billionaire
  "Q82955",    # politician
  "Q30461",    # president
  "Q2066131",  # athlete
  "Q11513337", # esports player
  "Q2906862",  # influencer
  "Q2045208",  # internet celebrity
  "Q17125263", # YouTuber
  "Q57414145", # online streamer
  "Q50279140", # Twitch streamer
  "Q82594",    # computer scientist
  "Q13590141", # social media personality
  "Q1028181",  # painter
  "Q753110",   # photographer
  "Q11247470", # television actor
  "Q10798782", # television personality
  "Q40348",    # lawyer
  "Q15981151"  # model
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
      $res = Invoke-RestMethod -Uri $url -Headers $userAgent -TimeoutSec 180
      return $res.results.bindings
    } catch {
      if ($try -eq 5) {
        return @()
      }
      Start-Sleep -Seconds (3 * $try)
    }
  }
}

function Build-BulkQuery {
  param([int]$Offset)

  $valuesOcc = ($occupationQids | ForEach-Object { "wd:$_" }) -join " "

@"
SELECT DISTINCT ?item ?itemLabel ?image ?country ?countryLabel ?gender ?sitelinks WHERE {
  VALUES ?occ { $valuesOcc }
  VALUES ?gender { wd:Q6581097 wd:Q6581072 }

  ?item wdt:P31 wd:Q5;
        wdt:P21 ?gender;
        wdt:P18 ?image;
        wdt:P27 ?country;
        wdt:P106 ?occ;
        wikibase:sitelinks ?sitelinks.

  FILTER(?sitelinks >= $sitelinksMin)
  FILTER NOT EXISTS { ?item wdt:P570 ?deathDate. }

  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT $limit
OFFSET $Offset
"@
}

function Build-GeneralQuery {
  param(
    [int]$Offset,
    [int]$MinSitelinks
  )

@"
SELECT DISTINCT ?item ?itemLabel ?image ?country ?countryLabel ?gender ?sitelinks WHERE {
  VALUES ?gender { wd:Q6581097 wd:Q6581072 }

  ?item wdt:P31 wd:Q5;
        wdt:P21 ?gender;
        wdt:P18 ?image;
        wdt:P27 ?country;
        wikibase:sitelinks ?sitelinks.

  FILTER(?sitelinks >= $MinSitelinks)
  FILTER NOT EXISTS { ?item wdt:P570 ?deathDate. }

  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks)
LIMIT $limit
OFFSET $Offset
"@
}

function Add-Rows {
  param([System.Collections.Generic.Dictionary[string, object]]$Store, [array]$Rows)

  foreach ($row in $Rows) {
    if (-not $row.item.value -or -not $row.itemLabel.value -or -not $row.image.value -or -not $row.country.value) { continue }

    $genderQid = ($row.gender.value -split '/')[-1]
    if (-not $genderMap.ContainsKey($genderQid)) { continue }

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
        gender = $genderMap[$genderQid]
        countryId = $countryId
        countryName = $countryName
        sitelinks = $sitelinks
      }
    } elseif ($sitelinks -gt $Store[$id].sitelinks) {
      $Store[$id].sitelinks = $sitelinks
      $Store[$id].countryId = $countryId
      $Store[$id].countryName = $countryName
    }
  }
}

function Invoke-WikidataClaims {
  param([string[]]$Ids)

  if (-not $Ids.Count) { return $null }

  $joined = ($Ids -join '|')
  $url = "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=$joined"

  for ($try = 1; $try -le 4; $try++) {
    try {
      return Invoke-RestMethod -Uri $url -TimeoutSec 180
    } catch {
      if ($try -eq 4) { return $null }
      Start-Sleep -Seconds (2 * $try)
    }
  }
}

$store = New-Object 'System.Collections.Generic.Dictionary[string, object]'
$emptyBatches = 0

for ($offset = 0; $offset -le $maxOffset; $offset += $limit) {
  $query = Build-BulkQuery -Offset $offset
  $rows = Invoke-Sparql -Query $query

  if (-not $rows.Count) {
    $emptyBatches += 1
    if ($emptyBatches -ge 2) { break }
    continue
  }

  $emptyBatches = 0
  Add-Rows -Store $store -Rows $rows

  "batch_offset=$offset fetched=$($rows.Count) unique=$($store.Count)" | Write-Output

  if ($store.Count -ge ($targetCount + 1200) -and $offset -ge 4000) {
    break
  }

  Start-Sleep -Milliseconds 400
}

if ($store.Count -lt $targetCount) {
  $emptyBatches = 0

  for ($offset = 0; $offset -le $generalMaxOffset; $offset += $limit) {
    $query = Build-GeneralQuery -Offset $offset -MinSitelinks $generalSitelinksMin
    $rows = Invoke-Sparql -Query $query

    if (-not $rows.Count) {
      $emptyBatches += 1
      if ($emptyBatches -ge 2) { break }
      continue
    }

    $emptyBatches = 0
    Add-Rows -Store $store -Rows $rows

    "general_offset=$offset fetched=$($rows.Count) unique=$($store.Count)" | Write-Output

    if ($store.Count -ge ($targetCount + 700) -and $offset -ge 6000) {
      break
    }

    Start-Sleep -Milliseconds 350
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

    if ($continentSlug -and $iso2) {
      $countryMeta[$countryId] = [pscustomobject]@{
        continent = $continentSlug
        iso2 = $iso2
      }
    }
  }

  Start-Sleep -Milliseconds 150
}

$manualCountryOverride = @{
  "Q615" = [pscustomobject]@{ countryName = "Argentina"; countryCode = "ar"; continent = "south-america" } # Lionel Messi
}

$final = foreach ($row in $raw) {
  if ($row.name -match '^Q\d+$') { continue }

  if ($manualCountryOverride.ContainsKey($row.id)) {
    [pscustomobject]@{
      id = $row.id
      name = $row.name
      image = $row.image
      gender = $row.gender
      continent = $manualCountryOverride[$row.id].continent
      countryId = $row.countryId
      countryName = $manualCountryOverride[$row.id].countryName
      countryCode = $manualCountryOverride[$row.id].countryCode
      score = 1200
      sitelinks = $row.sitelinks
    }
    continue
  }

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
  Sort-Object @{Expression='sitelinks';Descending=$true}, name -Unique |
  Where-Object { $_.countryCode -and $_.continent }

$manualAdds = @(
  [pscustomobject]@{ id='CUSTOM_CENTRAL_CEE'; name='Central Cee'; image='https://commons.wikimedia.org/wiki/Special:FilePath/Central%20Cee%20at%20Reading%20Festival%202022.jpg'; gender='male'; continent='europe'; countryId='Q145'; countryName='United Kingdom'; countryCode='gb'; score=1200; sitelinks=130 }
)

$existingByName = @{}
$final | ForEach-Object { $existingByName[$_.name.ToLower()] = $true }
foreach ($p in $manualAdds) {
  if (-not $existingByName.ContainsKey($p.name.ToLower())) {
    $final += $p
  }
}

$final = $final | Sort-Object @{Expression='sitelinks';Descending=$true}, continent, countryName, gender, name

if ($final.Count -gt $targetCount) {
  $final = $final | Select-Object -First $targetCount
}

$final | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 "celebs.json"

$contStats = $final | Group-Object continent | Sort-Object Name | ForEach-Object { "{0}:{1}" -f $_.Name, $_.Count }
"total=$($final.Count)" | Write-Output
"male=$((($final | Where-Object gender -eq 'male').Count)) female=$((($final | Where-Object gender -eq 'female').Count))" | Write-Output
"continents=" + ($contStats -join ",") | Write-Output
"min_sitelinks=$sitelinksMin" | Write-Output
"general_min_sitelinks=$generalSitelinksMin" | Write-Output
"target=$targetCount" | Write-Output
