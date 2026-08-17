#!/bin/bash
# Chunked nmap scan to avoid timeouts
TARGET=$1
if [ -z "$TARGET" ]; then
  echo "Usage: $0 <target>"
  exit 1
fi
OUTPUT="/tmp/nmap_chunked_output.txt"
> $OUTPUT
for START in $(seq 1 1000 65535); do
  END=$((START+999))
  if [ $END -gt 65535 ]; then END=65535; fi
  echo "Scanning ports $START-$END"
  nmap -sS -T4 -Pn -p $START-$END $TARGET >> $OUTPUT
done
cat $OUTPUT
