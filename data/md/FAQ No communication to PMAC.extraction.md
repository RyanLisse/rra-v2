FAQ Entry, no communication to PMAC <!-- text, from page 0 (l=0.113,t=0.081,r=0.478,b=0.105), with ID 5b918956-2fe0-475f-9bd1-15ce7be533a0 -->

Whenever the PMAC has no communication in the software, the network needs to be checked. The internal network can be recognized by the yellow rj45 cat5 cables inside of the control cabinet. <!-- text, from page 0 (l=0.112,t=0.141,r=0.882,b=0.203), with ID eace6424-c437-412b-88ce-3a46ff552f78 -->

The error notification for this issue looks like this: <!-- text, from page 0 (l=0.114,t=0.241,r=0.546,b=0.262), with ID d178fd19-37b9-4984-a55a-065b81a3a076 -->

Summary : This image is a screenshot of an error message dialog from RoboRail software, indicating a connection issue with Power PMAC hardware.

screenshot:
Scene Overview :
  • The main subject is a pop-up error dialog box with a dark background and white text.
  • The dialog is titled "Error" and contains a large red circle with a white "X" icon on the left.
  • The error message reads: "026:002:013: PowerPmac boot timeout, could not connect."
  • Two buttons are visible at the bottom: "Ignore" and "Abort" (both are greyed out).

Technical Details :
  • The dialog box is a standard Windows-style pop-up with a close ("X") button in the upper right corner.
  • The error code is explicitly shown as "026:002:013".
  • The message specifically refers to a "PowerPmac boot timeout" and inability to connect.

Spatial Relationships :
  • The error icon is on the left, message text is centered, and action buttons are at the bottom right.
  • The dialog is cropped, showing only part of the surrounding application window.

Analysis :
  • The screenshot documents a failed attempt by RoboRail software to connect to Power PMAC hardware, with a specific timeout error and no available user actions except to close the dialog. <!-- figure, from page 0 (l=0.115,t=0.271,r=0.884,b=0.407), with ID 3858f80b-7f55-4680-9e62-faa97555b33a -->

Follow this flowchart to investigate the issue, more instructions are on the next pages: <!-- text, from page 0 (l=0.115,t=0.432,r=0.860,b=0.453), with ID 471ad37d-69be-4bf7-aa8d-9f669d92c224 -->

Summary : This flowchart provides a step-by-step troubleshooting guide for resolving PMAC connection errors in RoboRail software, outlining diagnostic steps and corresponding remedies based on network ping results.

flowchart:
# Steps to check :
• PMAC connections errors in RoboRail software (rectangle)
• Ping Pmac 192.168.7.10 (rectangle)
• Ping robot controller Ping 192.168.7.11 (rectangle)

# Possible remedies :
• For Ping Pmac 192.168.7.10 — Ping Successful:
  1. Restart RoboRail Software.
  2. Power cycle machine.
  3. Needs deeper investigation by HGG.
• For Ping Pmac 192.168.7.10 — Ping failed, but Ping robot controller — Ping Successful:
  1. Power cycle machine.
  2. Check wiring of PMAC.
  3. Needs deeper investigation by HGG.
• For Ping Pmac 192.168.7.10 — Ping failed, and Ping robot controller — Ping Failed:
  1. Bypass the switch.
  2. Order new switch.
  3. Power cycle machine.
  4. Needs deeper investigation by HGG.

# Nodes :
• PMAC connections errors in RoboRail software (rectangle)
• Ping Pmac 192.168.7.10 (rectangle)
• Ping robot controller Ping 192.168.7.11 (rectangle)
• Three remedy boxes (rectangles) corresponding to each branch outcome

# Connectors :
• Downward arrows from each step to the next
• Horizontal arrows from each decision point (Ping Successful / Ping Failed) to the corresponding remedies
• Branches labeled "Ping Successful" and "Ping Failed" at each decision point

# Layout :
• Two main columns: "Steps to check" (left) and "Possible remedies" (right)
• Vertical flow in the left column, with horizontal connectors to the right column at each decision outcome
• Remedies grouped in boxes aligned with their corresponding diagnostic outcome

# Analysis :
• The flowchart systematically narrows down the source of PMAC connection issues by using network ping tests to isolate whether the problem lies with the PMAC, the robot controller, or the network switch.
• Remedies escalate from simple software restarts and power cycles to hardware checks and replacement, with an option for deeper investigation if basic steps fail.
• The structure ensures that users follow a logical diagnostic path, minimizing unnecessary interventions and focusing on the most probable causes first. <!-- figure, from page 0 (l=0.114,t=0.462,r=0.886,b=0.907), with ID 09908d3b-6b1b-409c-9a20-5058ed653fb2 -->

To test the physical connection to the PMAC, it should be pinged: <!-- text, from page 0 (l=0.109,t=0.079,r=0.705,b=0.104), with ID 09317d3d-c704-426c-b37b-af4f282ddb53 -->

Summary : This image is a screenshot showing the process of opening the Windows Command Prompt by typing "cmd" in the Windows Start menu search bar.

screenshot:
Scene Overview : 
  • The main subject is the Windows Start menu interface, with the search bar at the bottom containing the text "cmd".
  • The highlighted result is "Opdrachtprompt" (Dutch for "Command Prompt"), categorized under "System".
  • Other search results include "CmDust", "x86 Native Tools Command Prompt for VS 2017", and "x64_x86 Cross Tools Command Prompt for VS 2017".
  • The interface language is Dutch.

Technical Details : 
  • The search bar at the bottom left is active, with "cmd" entered.
  • The left pane shows categories: "Alle", "Apps", "Documenten", "Instellingen", "Meer".
  • The highlighted result is visually distinct with a blue background.

Spatial Relationships : 
  • The search bar is at the bottom left.
  • The list of results appears above the search bar, with the top result highlighted.
  • The right side of the image is blank, likely for instructional overlay.

Analysis : 
  • The screenshot visually instructs users to open the Command Prompt by typing "cmd" in the Windows Start menu and selecting the top result. The use of Dutch language indicates localization, but the process is visually clear regardless of language. <!-- figure, from page 0 (l=0.135,t=0.111,r=0.893,b=0.455), with ID 05928219-cc0e-4975-bbec-8c61593ca284 -->

Y:\>ping 192.168.7.10

Pinging 192.168.7.10 with 32 bytes of data:
Reply from 192.168.7.10: bytes=32 time<1ms TTL=64
Reply from 192.168.7.10: bytes=32 time<1ms TTL=64
Reply from 192.168.7.10: bytes=32 time<1ms TTL=64
Reply from 192.168.7.10: bytes=32 time<1ms TTL=64

Ping statistics for 192.168.7.10:
    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 0ms, Maximum = 0ms, Average = 0ms <!-- text, from page 0 (l=0.111,t=0.485,r=0.828,b=0.711), with ID 16ca7fa5-b3fe-461f-8425-4f708f90f045 -->

Summary : This image is a screenshot showing the output of a Windows command prompt after executing a ping command to the IP address 192.168.7.10, with a highlighted example of a problematic network response.

screenshot:
Scene Overview :
  • The main subject is a command prompt window displaying the results of a ping test to 192.168.7.10.
  • The text "An example of a bad response:" appears at the top, indicating the instructional or diagnostic purpose.
  • The response "TTL expired in transit." is highlighted with a red box, drawing attention to the network issue.

Technical Details :
  • The command executed is "ping 192.168.7.10".
  • Four replies are received, all from 185.220.109.1, not the intended destination.
  • Each reply contains the message "TTL expired in transit."
  • Ping statistics show: Packets: Sent = 4, Received = 4, Lost = 0 (0% loss).

Spatial Relationships :
  • The highlighted error message is centrally located in the output, making it the focal point.
  • The command and results are presented in standard command prompt formatting, with the error repeated for each reply.

Analysis :
  • The screenshot demonstrates a network routing or configuration issue, where packets do not reach the intended destination (192.168.7.10) but instead expire at an intermediate hop (185.220.109.1), as indicated by the repeated "TTL expired in transit." message.
  • The highlighting emphasizes the nature of the bad response for instructional or troubleshooting purposes. <!-- figure, from page 0 (l=0.114,t=0.733,r=0.826,b=0.910), with ID 003a1d3b-a9ae-4665-9ed5-e73d51b450e6 -->

3. If the ping fails and mentions TTL expired in transit, try to ping 192.168.7.11 as well <!-- text, from page 0 (l=0.141,t=0.102,r=0.854,b=0.145), with ID d1ebdd3d-862f-4501-8bc7-3eb48403a73f -->

The situation in the upper right corner should look like this: <!-- text, from page 0 (l=0.115,t=0.182,r=0.630,b=0.202), with ID fbc93172-b64d-4aaf-8a3c-f24c5186e4de -->

Summary : This photo shows the interior of an industrial electrical control panel, focusing on network and control wiring, Ethernet switch, and an industrial computer.

photo:
Scene Overview :
  • The main subject is the inside of an electrical control cabinet.
  • The perspective is from the front, showing the upper section of the panel.
  • Lighting is even, with clear visibility of wiring, devices, and labels.
  • The color palette includes yellow, red, and black wires, grey and metallic components, and a blue cabinet interior.

Technical Details :
  • Key components visible: a Phoenix Contact Ethernet switch (center), an Omron CX2E industrial computer (right), relays, terminal blocks, and a power supply.
  • Ethernet cables (yellow, red, black) are connected to the switch and computer.
  • Terminal blocks and relays are labeled with tags such as "18TH13," "X2," "175B1," and "17CK7."
  • No scale bar or explicit dimensions, but standard industrial component sizes suggest a medium-sized panel.

Spatial Relationships :
  • The Ethernet switch is mounted centrally, with cables routed from above.
  • The Omron CX2E computer is mounted on the right side, with network and power cables attached.
  • Terminal blocks and relays are arranged in rows at the bottom, with organized wiring harnesses.
  • Labels are affixed to both wiring and device rows for identification.

Analysis :
  • The image demonstrates a well-organized industrial control panel with clear cable management and labeling.
  • The presence of an Ethernet switch and industrial computer indicates networked automation or control functions.
  • The layout facilitates maintenance and troubleshooting, with accessible wiring and labeled components. <!-- figure, from page 0 (l=0.116,t=0.211,r=0.813,b=0.583), with ID dd865c61-d5d4-4452-b737-fe58faa1d1ac -->

Summary : This figure provides photographic documentation of the location and appearance of the empty RJ45 feedthrough labeled "Internal" on the right side of a control cabinet, as part of instructions for bypassing a network switch.

photo:
Scene Overview :
  • Two close-up color photographs of a metallic control cabinet panel with multiple connectors.
  • The left image shows a section of the panel with several connectors, including an empty RJ45 port labeled "Internal" and a populated port above it with a red Ethernet cable.
  • The right image provides a zoomed-in view of the same RJ45 feedthrough, with the "Internal" label clearly visible below the port, and adjacent connectors labeled "Ethercat" and "Light Sensor".

Technical Details :
  • The RJ45 feedthrough is metallic, rectangular, and mounted flush with the panel.
  • The label "Internal" is engraved or printed directly below the empty RJ45 port.
  • Other visible connectors include DB9 and DB15 serial ports, and a black plastic cover on one port.
  • The panel is silver with engraved black text; the cabinet interior is blue.

Spatial Relationships :
  • The empty "Internal" RJ45 port is located below a populated port with a red cable.
  • The "Ethercat" and "Light Sensor" connectors are to the right of the "Internal" port.
  • The images are oriented to show the right side of the control cabinet, as referenced in the instructions.

Analysis :
  • The photographs clearly identify the correct RJ45 feedthrough to use for bypassing the switch, minimizing the risk of confusion with other similar ports on the panel.
  • The close-up and context views together ensure the user can match the physical layout to the instructions. <!-- figure, from page 0 (l=0.110,t=0.081,r=0.892,b=0.511), with ID 592a4c83-09d8-4dc7-a487-ba075815ac65 -->

2. Unscrew the two crosshead screws and undo the coupler.
3. Use the couple to connect the ETH_RC and ETH_CK3 directly to each other: <!-- text, from page 0 (l=0.138,t=0.524,r=0.838,b=0.570), with ID 16795e62-8076-4679-8f0a-30670ea5149a -->

Summary : This image shows a close-up view of an industrial control panel, focusing on an Ethernet switch (labelled 17SB1) with multiple connected cables, and is accompanied by an instruction to check network connectivity to a specific IP address.

photo:
Scene Overview :
  • Main subject is an Ethernet switch (labelled "17SB1 ETHERNET SWITCH") mounted inside an industrial control panel.
  • Several yellow Ethernet cables are plugged into the switch, each labelled (e.g., "ETH_RC", "ETH-CK3").
  • The panel also contains terminal blocks with multicoloured wiring, a device labelled "HOURS", and other labelled components ("X2", "M METER COUNTER").
  • The perspective is from above, showing the cabling and device arrangement clearly.
  • Lighting is even, with a neutral colour palette dominated by metallic and yellow tones.

Technical Details :
  • No scale bar or magnification is present.
  • Visible text labels on cables and devices: "ETH_RC", "ETH-CK3", "17SB1", "X2", "M", "HOURS", "16-80VDC".
  • The Ethernet switch has at least five visible ports, with three in use.
  • A DB9 serial connector is attached to one of the yellow Ethernet cables.
  • Instruction at the bottom: "Check if 192.168.7.10 can now be successfully pinged."

Spatial Relationships :
  • The Ethernet switch is centrally located, with cables radiating outward.
  • Terminal blocks and other devices are arranged horizontally below the switch.
  • Cable labels are positioned for easy identification.

Analysis :
  • The image documents the physical network setup in an industrial control environment, highlighting the Ethernet switch and cable connections.
  • The instruction suggests a troubleshooting or commissioning step, verifying network connectivity to the device at IP address 192.168.7.10.
  • The clear labelling and cable management indicate an organised and maintainable installation. <!-- figure, from page 0 (l=0.143,t=0.078,r=0.887,b=0.470), with ID bcd8976c-bc3f-4ac4-9c38-d8c41af30a40 -->