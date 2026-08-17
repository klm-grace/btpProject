from scapy.all import ARP, Ether, srp

def arp_ping(network="192.168.1.0/24"):
    # Create ARP request packet
    arp = ARP(pdst=network)
    ether = Ether(dst="ff:ff:ff:ff:ff:ff")
    packet = ether/arp
    result = srp(packet, timeout=2, verbose=False)[0]
    for sent, received in result:
        print(f"{received.psrc} is at {received.hwsrc}")

if __name__ == "__main__":
    arp_ping()
