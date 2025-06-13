import { motion } from 'framer-motion';
import { t } from '@/lib/translations/dutch';

export const Greeting = () => {
  return (
    <div
      key="overview"
      className="max-w-4xl mx-auto md:mt-12 px-8 size-full flex flex-col justify-center"
    >
      {/* Main Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.4 }}
        className="text-3xl font-bold text-blue-600 mb-2"
      >
        {t('welcome')}
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
        className="text-lg text-zinc-700 mb-6"
      >
        {t('greeting_message')}
      </motion.div>

      {/* Main Capabilities */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
        className="mb-6"
      >
        <h3 className="text-lg font-semibold text-zinc-800 mb-3">{t('capabilities_title')}</h3>
        <div className="grid md:grid-cols-2 gap-2 text-sm text-zinc-600">
          <div>{t('help_calibration')}</div>
          <div>{t('help_pmac')}</div>
          <div>{t('help_measurement')}</div>
          <div>{t('help_manuals')}</div>
          <div>{t('help_chuck_alignment')}</div>
          <div>{t('help_troubleshooting')}</div>
        </div>
      </motion.div>

      {/* Knowledge Base Overview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.7 }}
        className="mb-6"
      >
        <h3 className="text-lg font-semibold text-zinc-800 mb-3">{t('knowledge_base_title')}</h3>
        <div className="space-y-1 text-sm text-zinc-600">
          <div>{t('kb_operators_manual')}</div>
          <div>{t('kb_calibration_faq')}</div>
          <div>{t('kb_chuck_alignment')}</div>
          <div>{t('kb_measurement_guide')}</div>
          <div>{t('kb_pmac_troubleshooting')}</div>
          <div>{t('kb_general_troubleshooting')}</div>
        </div>
      </motion.div>

      {/* Usage Tips */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.8 }}
        className="mb-6"
      >
        <h3 className="text-lg font-semibold text-zinc-800 mb-3">{t('usage_title')}</h3>
        <div className="space-y-1 text-sm text-zinc-600">
          <div>{t('tip_database_selector')}</div>
          <div>{t('tip_specific_questions')}</div>
          <div>{t('tip_context')}</div>
          <div>{t('tip_language')}</div>
        </div>
      </motion.div>

      {/* Safety Notes */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.9 }}
        className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
      >
        <h3 className="text-lg font-semibold text-zinc-800 mb-3">{t('safety_title')}</h3>
        <div className="space-y-2 text-sm">
          <div className="text-amber-800">{t('safety_note')}</div>
          <div className="text-blue-800">{t('calibration_note')}</div>
          <div className="text-green-800">{t('pmac_note')}</div>
        </div>
      </motion.div>

      {/* Example Questions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 1.0 }}
        className="mb-6"
      >
        <h3 className="text-lg font-semibold text-zinc-800 mb-3">{t('example_questions_title')}</h3>
        <div className="space-y-2 text-sm text-zinc-600 italic">
          <div className="pl-4 border-l-2 border-blue-200">{t('example_q1')}</div>
          <div className="pl-4 border-l-2 border-blue-200">{t('example_q2')}</div>
          <div className="pl-4 border-l-2 border-blue-200">{t('example_q3')}</div>
        </div>
      </motion.div>

      {/* Call to Action */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 1.1 }}
        className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg"
      >
        <div className="text-lg font-medium text-blue-800 mb-2">{t('ask_question')}</div>
        <div className="text-sm text-blue-600">
          {t('tip_database_selector')}
        </div>
      </motion.div>
    </div>
  );
};
