// Simple Dutch translations for RoboRail Assistant MVP
// Technical terms remain in English where appropriate

export const translations = {
  // Navigation
  'new_chat': 'Nieuwe Chat',
  'documents': 'Documenten',
  'upload': 'Uploaden',
  'search': 'Zoeken',
  'settings': 'Instellingen',
  
  // Chat interface
  'type_message': 'Typ uw RoboRail vraag hier...',
  'type_message_examples': [
    'Hoe kalibreer ik de chuck alignment?',
    'PMAC reageert niet, wat moet ik doen?',
    'Welke meetprocedure moet ik volgen?',
    'Hoe los ik communicatie problemen op?',
    'Wat zijn de veiligheidsprocedures?'
  ],
  'send': 'Verzenden',
  'clear_chat': 'Chat wissen',
  'export_chat': 'Chat exporteren',
  
  // Database selector
  'select_database': 'Selecteer Database',
  'all_documents': 'Alle Documenten',
  'roborail_manuals': 'RoboRail Handleidingen',
  'faq_troubleshooting': 'FAQ & Probleemoplossing',
  'calibration_guides': 'Calibratie Gidsen',
  
  // Greetings and help text
  'welcome': 'Welkom bij de RoboRail Assistent',
  'greeting_message': 'Ik ben uw persoonlijke RoboRail technische assistent met toegang tot alle officiële documentatie.',
  
  // Main capability areas
  'capabilities_title': 'Waar ik u mee kan helpen:',
  'help_calibration': '• Calibratie procedures voor RoboRail systemen',
  'help_pmac': '• PMAC controller communicatie en troubleshooting',
  'help_measurement': '• Meetprocedures en data verzameling protocollen',
  'help_manuals': '• Zoeken in operators handleidingen en FAQ\'s',
  'help_chuck_alignment': '• Chuck alignment en kalibratie procedures',
  'help_troubleshooting': '• Stap-voor-stap probleemoplossing',
  
  // Knowledge base sections
  'knowledge_base_title': 'Beschikbare documentatie:',
  'kb_operators_manual': '• Operators Manual RoboRail V2.2 (Volledige systeemhandleiding)',
  'kb_calibration_faq': '• Calibratie FAQ\'s en procedures',
  'kb_chuck_alignment': '• Chuck alignment kalibratie gids',
  'kb_measurement_guide': '• Meetprocedures en data collection',
  'kb_pmac_troubleshooting': '• PMAC communicatie troubleshooting',
  'kb_general_troubleshooting': '• Algemene troubleshooting procedures',
  
  // Usage guidance
  'usage_title': 'Tips voor optimaal gebruik:',
  'tip_database_selector': '• Gebruik de database selector rechtsboven voor gefocuste zoekresultaten',
  'tip_specific_questions': '• Stel specifieke vragen over procedures, error codes, of onderdelen',
  'tip_context': '• Vermeld uw huidige stap in het proces voor contextgerichte hulp',
  'tip_language': '• Technische termen blijven in het Engels voor precisie',
  
  // Safety and best practices
  'safety_title': 'Veiligheid en best practices:',
  'safety_note': '⚠️ Volg altijd de officiële veiligheidsprocedures uit de operators manual',
  'calibration_note': '🔧 Voer kalibraties uit volgens de gespecificeerde procedures',
  'pmac_note': '💻 Controleer PMAC verbindingen voordat u troubleshooting start',
  
  'ask_question': 'Stel uw vraag hieronder - ik doorzoek alle relevante documentatie voor u.',
  'example_questions_title': 'Voorbeeldvragen:',
  'example_q1': '"Hoe kalibreer ik de RoboRail voor nieuwe metingen?"',
  'example_q2': '"PMAC reageert niet, wat zijn de troubleshooting stappen?"',
  'example_q3': '"Welke data moet ik verzamelen tijdens de kalibratie?"',
  
  // Document uploader
  'drag_drop': 'Sleep bestanden hierheen of klik om te selecteren',
  'supported_formats': 'Ondersteunde formaten: PDF, DOCX',
  'uploading': 'Uploaden...',
  'upload_success': 'Upload succesvol',
  'upload_error': 'Upload mislukt',
  
  // Common actions
  'cancel': 'Annuleren',
  'save': 'Opslaan',
  'delete': 'Verwijderen',
  'edit': 'Bewerken',
  'copy': 'Kopiëren',
  'close': 'Sluiten',
  
  // Status messages
  'loading': 'Laden...',
  'processing': 'Verwerken...',
  'ready': 'Gereed',
  'error': 'Fout',
  
  // Database selector explanations
  'database_selector_title': 'Selecteer Kennisbank',
  'database_help': 'Kies de juiste documentatie voor uw vraag',
  'database_all_tooltip': 'Doorzoekt alle beschikbare RoboRail documentatie - gebruik voor algemene vragen',
  'database_manuals_tooltip': 'Operators Manual RoboRail V2.2 - volledige systeemhandleiding en procedures',
  'database_faq_tooltip': 'FAQ documenten - veelgestelde vragen en troubleshooting guides',
  'database_calibration_tooltip': 'Kalibratie-specifieke documenten - chuck alignment en kalibratieprocedures',
  'database_refresh_tooltip': 'Vernieuw database verbindingen en status',
  'database_status_connected': 'Database verbonden en beschikbaar',
  'database_status_disconnected': 'Database niet verbonden',
  'database_status_unavailable': 'Database niet beschikbaar',
  
  // RoboRail specific (keep technical terms)
  'calibration_status': 'Calibratie Status',
  'pmac_connection': 'PMAC Verbinding',
  'measurement_mode': 'Meetmodus',
  'chuck_alignment': 'Chuck Alignment',
  
  // User menu
  'sign_out': 'Uitloggen',
  'profile': 'Profiel',
  'help': 'Help'
};

// Simple translation helper
export function t(key: string): string {
  return translations[key as keyof typeof translations] || key;
}

// Helper for dynamic translations
export function translateDynamic(text: string): string {
  // Common UI text replacements
  const replacements: Record<string, string> = {
    'New Chat': 'Nieuwe Chat',
    'Documents': 'Documenten',
    'Upload': 'Uploaden',
    'Search': 'Zoeken',
    'Settings': 'Instellingen',
    'Loading': 'Laden',
    'Processing': 'Verwerken',
    'Sign Out': 'Uitloggen',
    'Help': 'Help'
  };
  
  return replacements[text] || text;
}