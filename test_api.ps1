# Test API endpoints
Write-Host "Testing health endpoint..."
$health = Invoke-RestMethod -Uri 'http://localhost:8002/api/health' -Method GET
Write-Host "Health check: $($health | ConvertTo-Json)"

Write-Host "`nTesting create conversation..."
try {
    $newConv = Invoke-RestMethod -Uri 'http://localhost:8002/api/conversations' -Method POST -ContentType 'application/json' -Body '{}'
    Write-Host "New conversation created: $($newConv.id)"
    
    Write-Host "`nSending message..."
    $msg = Invoke-RestMethod -Uri "http://localhost:8002/api/conversations/$($newConv.id)/message" -Method POST -ContentType 'application/json' -Body '{"content": "Hello"}'
    Write-Host "Message sent!"
}
catch {
    Write-Host "Error: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
        Write-Host "Response: $($reader.ReadToEnd())"
    }
}
