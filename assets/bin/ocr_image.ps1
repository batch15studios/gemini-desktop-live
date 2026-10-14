param(
    [string]$ImagePath = ""
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
}[0]

Function Await($asyncOp, $type) {
    $method = $asTaskGeneric.MakeGenericMethod($type)
    $task = $method.Invoke($null, @($asyncOp))
    $task.Wait()
    return $task.Result
}

if (-not (Test-Path $ImagePath)) {
    Write-Output '{"error":"Image file not found"}'
    exit 1
}

$fullPath = (Resolve-Path $ImagePath).Path

try {
    $storageFileType = [Windows.Storage.StorageFile, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
    $file = Await ($storageFileType::GetFileFromPathAsync($fullPath)) ($storageFileType)

    $streamType = [Windows.Storage.Streams.IRandomAccessStream, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ($streamType)

    $decoderType = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
    $decoder = Await ($decoderType::CreateAsync($stream)) ($decoderType)

    $softwareBitmapType = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
    $sb = Await ($decoder.GetSoftwareBitmapAsync()) ($softwareBitmapType)

    $ocrEngineType = [Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
    $ocr = $ocrEngineType::TryCreateFromUserProfileLanguages()
    if ($null -eq $ocr) {
        Write-Output '{"error":"Failed to initialize Windows OCR Engine"}'
        exit 1
    }

    $ocrResultType = [Windows.Media.Ocr.OcrResult, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
    $res = Await ($ocr.RecognizeAsync($sb)) ($ocrResultType)

    $lines = @()
    foreach ($line in $res.Lines) {
        $words = @()
        foreach ($w in $line.Words) {
            $words += [PSCustomObject]@{
                text = $w.Text
                x = [int]$w.BoundingRect.X
                y = [int]$w.BoundingRect.Y
                w = [int]$w.BoundingRect.Width
                h = [int]$w.BoundingRect.Height
            }
        }
        $lines += [PSCustomObject]@{
            text = $line.Text
            words = $words
        }
    }

    $out = [PSCustomObject]@{
        success = $true
        text = $res.Text
        lineCount = $res.Lines.Count
        lines = $lines
    }

    $out | ConvertTo-Json -Depth 5 -Compress
} catch {
    $err = [PSCustomObject]@{
        error = $_.Exception.Message
    }
    $err | ConvertTo-Json -Compress
}
