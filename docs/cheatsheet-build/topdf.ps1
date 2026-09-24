$docx = Join-Path $PSScriptRoot '..\OCR_LMC_CheatSheet.docx'
$pdf  = Join-Path $PSScriptRoot '..\OCR_LMC_CheatSheet.pdf'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $d = $word.Documents.Open($docx)
  $d.SaveAs([ref]$pdf, [ref]17)
  "pages: " + $d.ComputeStatistics(2)
  $d.Close([ref]0)
} finally { $word.Quit() }
