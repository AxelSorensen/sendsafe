// Accounts on this computer, for the login screen. Local only (the tunnel guard hides it from the internet).
export default defineEventHandler(() => ({ current: currentProfile(), accounts: listAccounts() }))
