$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Keep credentials out of command arguments, shell history, and source files.
$bootstrapKeys = @('BOOTSTRAP_NAME', 'BOOTSTRAP_EMAIL', 'BOOTSTRAP_PHONE', 'BOOTSTRAP_PASSWORD')
$previousValues = @{}
foreach ($key in $bootstrapKeys) {
    $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
$setupExitCode = 1
$securePassword = $null
$confirmation = $null
$passwordPointer = [IntPtr]::Zero
$confirmationPointer = [IntPtr]::Zero
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    Write-Host 'Create the first Developer (platform admin) account.'
    Write-Host 'MongoDB must be running. An existing Developer account will not be replaced.'
    $adminName = (Read-Host 'Full name').Trim()
    $adminEmail = (Read-Host 'Email').Trim()
    $adminPhone = (Read-Host 'Phone (10-15 digits, optional leading +)').Trim()
    $securePassword = Read-Host 'Password (12-128 characters)' -AsSecureString
    $confirmation = Read-Host 'Confirm password' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
    $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $confirmedPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
    if ($adminPassword -cne $confirmedPassword) { throw 'Passwords do not match. Run setup again.' }
    if ($adminPassword.Length -lt 12 -or $adminPassword.Length -gt 128) {
        throw 'Password must contain 12-128 characters.'
    }
    if ($adminName.Length -lt 2 -or $adminName.Length -gt 100) { throw 'Name must contain 2-100 characters.' }
    if ($adminPhone -notmatch '^\+?[1-9]\d{9,14}$') { throw 'Enter a valid phone number with 10-15 digits.' }
    [Environment]::SetEnvironmentVariable('BOOTSTRAP_NAME', $adminName, 'Process')
    [Environment]::SetEnvironmentVariable('BOOTSTRAP_EMAIL', $adminEmail, 'Process')
    [Environment]::SetEnvironmentVariable('BOOTSTRAP_PHONE', $adminPhone, 'Process')
    [Environment]::SetEnvironmentVariable('BOOTSTRAP_PASSWORD', $adminPassword, 'Process')
    & npm.cmd run bootstrap
    $setupExitCode = $LASTEXITCODE
    if ($setupExitCode -eq 0) {
        Write-Host 'Setup complete. Start the backend with npm run dev.'
        Write-Host 'Open http://localhost:5179/login and sign in with the email and password you just entered.'
    } else {
        Write-Host 'Account setup failed. Check the error above. If DEVELOPER_ALREADY_BOOTSTRAPPED appears, use your existing account.'
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    foreach ($key in $bootstrapKeys) {
        [Environment]::SetEnvironmentVariable($key, $previousValues[$key], 'Process')
    }
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($confirmationPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer) }
    if ($null -ne $securePassword) { $securePassword.Dispose() }
    if ($null -ne $confirmation) { $confirmation.Dispose() }
    $adminPassword = $null
    $confirmedPassword = $null
    Pop-Location
}
exit $setupExitCode
