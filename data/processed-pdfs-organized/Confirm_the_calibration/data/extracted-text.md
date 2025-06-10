# Confirm the calibration.pdf - Text Extraction

**Extraction Date:** 2025-06-08T09:35:38.952Z
**File:** Confirm the calibration.pdf
**Pages:** 4
**Characters:** 4596
**Words:** 534
**Language:** unknown
**Processing Time:** 198ms
**Confidence:** 80%

---

## Extracted Text

HGG Profiling Equipment 
Internal Documentation 

Jasper ten Hove 
Version 1.0 
2024-05-16 
Confirm the calibration 
How to check if the calibration was successfull 

 

 
HGG Profiling Equipment – Confirm the calibration – v1.0 – 2024-05-16 1 
1 Table of Contents 
1 Table of Contents ................................................................................................................................... 1 
2 Document Information ........................................................................................................................... 2 
2.1 Document Management ............................................................................................................... 2 
2.2 Document History ......................................................................................................................... 2 
2.3 Related Documents ....................................................................................................................... 2 
2.4 Who can use this document ......................................................................................................... 2 
3 Perform a base calibration ..................................................................................................................... 3 
4 Perform a tool calibration....................................................................................................................... 3 
5 Verify the calibration .............................................................................................................................. 3 
5.1 Verify base z .................................................................................................................................. 3 
5.2 Verify conveyor Z .......................................................................................................................... 3 
5.3 Verify base X .................................................................................................................................. 3 

 

 
HGG Profiling Equipment – Confirm the calibration – v1.0 – 2024-05-16 2 
2 Document Information 
2.1 Document Management 
Please send any document errors or comments to: 
Document Manager 
2.2 Document History 
Version Changes Authors 
1.0 Initial version Jasper ten Hove 
2.3 Related Documents 
Version Title 
 FAQ calibration 

 
2.4 Who can use this document 
This document is intended for HGG service engineers.

HGG Profiling Equipment – Confirm the calibration – v1.0 – 2024-05-16 3 
3 Perform a base calibration 
To perform a base calibration you will need a square tube with very accurate dimensions. Preferably the provided 
calibration tube.

Next you will need to follow the instructions on the calibration dialog. 

4 Perform a tool calibration 
To perform the tool calibration please follow the instructions on the calibration in the calibration dialog.

Make sure the tool sensor cover is removed before starting the calibration. Also make sure the 125Amp 
consumables are mounted.

When doing the calibration keep an eye on where the laser hits the tool. Make sure the laser hits the black part of 
the tool and not the white part. 

5 Verify the calibration 
5.1 Verify base z 
• To verify the base Z offset, program a square tube in ProCAM preferably use the provided calibration 
dialog. 
• Load the generated file in the software and apparoach the material. 
• Using an allenkey measure the distance between the torch and the material. 
• Look into the current cutting table what the height should be. 
• If the height is not correct adjust: machine calibration->robot base->Z. until the height is correct. 
5.2 Verify conveyor Z 
• Change the machine to conveyor mode. 
• Program a channel with the dimensions of the used calibration material. 
• Load the generated file in the software and approach the top of the material. 
• Measure the distance between the torch and the material with an allenkey. 
• Look into the current cutting table what the height should be. 
• If it is not correct adjust: bogies-> centerline Z offset. Until the height is correct 
5.3 Verify base X 
• Using the same file as in verify conveyor Z approach the material on the sides 
• Look into the current cutting table what the height should be. 
• Measure the distance on both sides, if the distance is not the same adjust: machine calibration->robot 
base->x until it is the same. 
o If the distance on both sides is too small, the tool calibration should be done over. Also base Z 
will need to be reviewed after doing the tool calibration.