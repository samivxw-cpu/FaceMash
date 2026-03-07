$ErrorActionPreference = "Stop"

$targetPerGender = 5000
$ua = @{ "User-Agent" = "FaceSmashBot/1.0 (educational project)" }

function Invoke-WikidataQuery {
  param([string]$Query)

  $encoded = [System.Uri]::EscapeDataString($Query)
  $url = "https://query.wikidata.org/sparql?format=json&query=$encoded"

  for ($i = 1; $i -le 3; $i++) {
    try {
      $res = Invoke-RestMethod -Uri $url -Headers $ua -TimeoutSec 120
      return $res.results.bindings
    } catch {
      if ($i -eq 3) { throw }
      Start-Sleep -Seconds (3 * $i)
    }
  }
}

function Build-QueryByOccupation {
  param(
    [string]$GenderQid,
    [string]$OccupationQid,
    [int]$Limit
  )

@"
SELECT DISTINCT ?item ?itemLabel ?image WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P21 wd:$GenderQid;
        wdt:P18 ?image;
        wdt:P106 wd:$OccupationQid.
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT $Limit
"@
}

function Build-QueryFallback {
  param(
    [string]$GenderQid,
    [int]$Limit,
    [int]$Offset
  )

@"
SELECT DISTINCT ?item ?itemLabel ?image WHERE {
  ?item wdt:P31 wd:Q5;
        wdt:P21 wd:$GenderQid;
        wdt:P18 ?image.
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT $Limit
OFFSET $Offset
"@
}

function Add-Bindings {
  param(
    [System.Collections.Generic.Dictionary[string, object]]$Store,
    [array]$Bindings,
    [string]$Gender
  )

  foreach ($b in $Bindings) {
    if (-not $b.item.value -or -not $b.itemLabel.value -or -not $b.image.value) { continue }

    $id = ($b.item.value -split '/')[-1]
    if (-not $Store.ContainsKey($id)) {
      $Store[$id] = [ordered]@{
        id = $id
        name = $b.itemLabel.value
        image = ($b.image.value -replace '^http:', 'https:')
        gender = $Gender
        score = 1200
      }
    }
  }
}

$occupationQids = @(
  "Q33999",    # actor
  "Q177220",   # singer
  "Q4610556",  # model
  "Q2066131",  # athlete
  "Q2526255",  # film director
  "Q947873",   # television presenter
  "Q245068",   # comedian
  "Q601156",   # rapper
  "Q639669",   # musician
  "Q10800557", # film producer
  "Q937857",   # association football player
  "Q3665646",  # basketball player
  "Q82955",    # politician
  "Q82955",    # politician (kept duplicate-safe)
  "Q10800557",
  "Q15981151", # influencer
  "Q18814623", # podcast host
  "Q3621491",  # writer
  "Q1028181",  # painter
  "Q2309784"   # gymnast
)

$femaleStore = New-Object 'System.Collections.Generic.Dictionary[string, object]'
$maleStore = New-Object 'System.Collections.Generic.Dictionary[string, object]'

foreach ($occ in $occupationQids) {
  if ($femaleStore.Count -lt $targetPerGender) {
    $q = Build-QueryByOccupation -GenderQid "Q6581072" -OccupationQid $occ -Limit 1200
    $rows = Invoke-WikidataQuery -Query $q
    Add-Bindings -Store $femaleStore -Bindings $rows -Gender "female"
    Start-Sleep -Milliseconds 500
  }

  if ($maleStore.Count -lt $targetPerGender) {
    $q = Build-QueryByOccupation -GenderQid "Q6581097" -OccupationQid $occ -Limit 1200
    $rows = Invoke-WikidataQuery -Query $q
    Add-Bindings -Store $maleStore -Bindings $rows -Gender "male"
    Start-Sleep -Milliseconds 500
  }

  if ($femaleStore.Count -ge $targetPerGender -and $maleStore.Count -ge $targetPerGender) {
    break
  }
}

$offset = 0
while ($femaleStore.Count -lt $targetPerGender -or $maleStore.Count -lt $targetPerGender) {
  if ($femaleStore.Count -lt $targetPerGender) {
    $qf = Build-QueryFallback -GenderQid "Q6581072" -Limit 1500 -Offset $offset
    $rf = Invoke-WikidataQuery -Query $qf
    Add-Bindings -Store $femaleStore -Bindings $rf -Gender "female"
    Start-Sleep -Milliseconds 600
  }

  if ($maleStore.Count -lt $targetPerGender) {
    $qm = Build-QueryFallback -GenderQid "Q6581097" -Limit 1500 -Offset $offset
    $rm = Invoke-WikidataQuery -Query $qm
    Add-Bindings -Store $maleStore -Bindings $rm -Gender "male"
    Start-Sleep -Milliseconds 600
  }

  $offset += 1500

  if ($offset -gt 30000) {
    break
  }
}

$female = $femaleStore.Values | Select-Object -First $targetPerGender
$male = $maleStore.Values | Select-Object -First $targetPerGender

$all = @($female + $male) | Sort-Object name

if ($all.Count -lt 10000) {
  throw "Dataset incomplet: $($all.Count) au lieu de 10000"
}

$all | ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8 "celebs.json"

"female=$($female.Count) male=$($male.Count) total=$($all.Count)" | Write-Output

