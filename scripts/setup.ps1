# PolkaZK — Environment Setup Script (Windows PowerShell)
# Run this to install all required tooling

Write-Host "=== PolkaZK Environment Setup ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Rust installation
Write-Host "[1/5] Checking Rust installation..." -ForegroundColor Yellow
$rustc = Get-Command rustc -ErrorAction SilentlyContinue
if (-not $rustc) {
    Write-Host "Rust not found. Please install from: https://rustup.rs/"
    Write-Host "After installing, restart this terminal and re-run this script."
    exit 1
}
rustc --version
Write-Host ""

# 2. Install nightly toolchain
Write-Host "[2/5] Installing Rust nightly toolchain..." -ForegroundColor Yellow
rustup install nightly
rustup component add rust-src --toolchain nightly
Write-Host ""

# 3. Install cargo-pvm-contract
Write-Host "[3/5] Installing cargo-pvm-contract..." -ForegroundColor Yellow
cargo install --force --locked cargo-pvm-contract
Write-Host ""

# 4. Check Foundry
Write-Host "[4/5] Checking Foundry installation..." -ForegroundColor Yellow
$cast = Get-Command cast -ErrorAction SilentlyContinue
if (-not $cast) {
    Write-Host "Foundry not found."
    Write-Host "Install from: https://getfoundry.sh/"
    Write-Host "  Run: curl -L https://foundry.paradigm.xyz | bash"
    Write-Host "  Then: foundryup"
    Write-Host ""
    Write-Host "On Windows, you can also use:"
    Write-Host "  cargo install --git https://github.com/foundry-rs/foundry cast anvil"
} else {
    Write-Host "Foundry already installed: $(cast --version)"
}
Write-Host ""

# 5. Check resolc
Write-Host "[5/5] Checking resolc (Revive compiler)..." -ForegroundColor Yellow
$resolc = Get-Command resolc -ErrorAction SilentlyContinue
if (-not $resolc) {
    Write-Host "resolc not found."
    Write-Host "Option A: Install via npm:"
    Write-Host "  npm install -g @parity/resolc"
    Write-Host ""
    Write-Host "Option B: Download binary from:"
    Write-Host "  https://github.com/paritytech/revive/releases"
    Write-Host ""
    Write-Host "Option C: Use Remix for Polkadot:"
    Write-Host "  https://remix.polkadot.io"
} else {
    Write-Host "resolc already installed: $(resolc --version)"
}
Write-Host ""

Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. cd contracts\rust-verifier; cargo build"
Write-Host "  2. Set up wallet: cast wallet new"
Write-Host "  3. Get testnet funds: https://faucet.polkadot.io/"
Write-Host "     Select 'Polkadot testnet (Paseo)' > 'Assethub'"
Write-Host "  4. Deploy: see scripts\deploy-rust.ps1"
