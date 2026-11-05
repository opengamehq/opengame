import { lookup } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import { LIMITS } from "@opengame/shared";

const blockedAddresses = new BlockList();
for (const [network, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) blockedAddresses.addSubnet(network, bits, "ipv4");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::", 3, "ipv6");
blockedAddresses.addSubnet("2001:db8::", 32, "ipv6");
export function publicVendorAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blockedAddresses.check(address, "ipv4") : family === 6 && globalV6.check(address, "ipv6") && !blockedAddresses.check(address, "ipv6");
}
// Bind the vetted DNS answer to the actual socket. A separate preflight lookup
// would leave a second resolution between the SSRF check and connection.
type ResolveAddresses = (hostname: string, callback: (error: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void) => void;
const resolveVendorAddresses: ResolveAddresses = (hostname, callback) => lookup(hostname, { all: true, verbatim: true }, callback);
function vendorLookup(resolveAddresses: ResolveAddresses, hosts: readonly string[]): LookupFunction { return (hostname, options, callback) => {
  if (!hosts.includes(hostname)) { callback(new Error("Unapproved dependency host"), "", 0); return; }
  resolveAddresses(hostname, (error, addresses) => {
    if (error || !addresses.length || addresses.some(row => !publicVendorAddress(row.address))) {
      callback(error ?? new Error("Dependency host resolved outside public addresses"), "", 0); return;
    }
    const matching = addresses.filter(row => !options.family || row.family === options.family);
    if (!matching.length) { callback(new Error("No public dependency address"), "", 0); return; }
    if (options.all) callback(null, matching);
    else callback(null, matching[0]!.address, matching[0]!.family);
  });
}; }

export function createVendorDispatcher(resolveAddresses: ResolveAddresses = resolveVendorAddresses, hosts: readonly string[] = LIMITS.platform.vendoring.hosts) {
  return new Agent({ connect: { lookup: vendorLookup(resolveAddresses, hosts) } });
}
