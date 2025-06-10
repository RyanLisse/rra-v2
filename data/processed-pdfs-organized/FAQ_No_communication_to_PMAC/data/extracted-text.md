# FAQ No communication to PMAC.pdf - Text Extraction

**Extraction Date:** 2025-06-08T09:35:38.976Z
**File:** FAQ No communication to PMAC.pdf
**Pages:** 5
**Characters:** 1209
**Words:** 197
**Language:** en
**Processing Time:** 8ms
**Confidence:** 100%

---

## Extracted Text

FAQ Entry, no communication to PMAC 

Whenever the PMAC has no communication in the software, the network needs to be 
checked. The internal network can be recognized by the yellow rj45 cat5 cables inside of 
the control cabinet.

The error notification for this issue looks like this: 
Power PMAC connection error in RoboRail software 

 
Follow this flowchart to investigate the issue, more instructions are on the next pages: 
Flowchart for solving PMAC connection issues 

To test the physical connection to the PMAC, it should be pinged: 
1. Press windows start and type cmd, press enter. 

 

2. Type “ping 192.168.7.10” and check the results 
An example of a correct response: 

 
An example of a bad response: 

3. If the ping fails and mentions TTL expired in transit, try to ping 192.168.7.11 as 
well 

The situation in the upper right corner should look like this: 

 

Bypassing the switch: 
1. Locate the empty RJ45 feedtrough on the right side of the control cabinet with the 
text “Internal”: 

 

2. Unscrew the two crosshead screws and undo the coupler. 
3. Use the couple to connect the ETH_RC and ETH_CK3 directly to each other: 

 
4. Check if 192.168.7.10 can now be successfully pinged.