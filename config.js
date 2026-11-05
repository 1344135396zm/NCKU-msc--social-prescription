// 網站設定：一般只需要改這個檔案。
window.SP_CONFIG = {
  // 資料來源。
  // 留空 = 讀取同資料夾的 data.csv。
  // 想改用 Google 試算表：檔案 → 共用 → 發布到網路 → 選「逗號分隔值 (.csv)」，把網址貼在這裡。
  dataUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4uJPlFo2Y1RlRPNM3WzWIqInGIqolw3k-m4YeRfb_zfcn8fStY0sna-aMpvYfc9uN9KFumGL0f-6D/pub?output=csv',

  // 「最後確認日期」超過幾個月，會在 Link Worker 模式顯示「需重新確認」。
  staleMonths: 6,

  // 需求類別。CSV 的 category 欄可以填 key 或 label，多個類別用「、」分隔。
  categories: [
    { key: 'social',   label: '社會連結',   need: '想認識人，不想一個人',     icon: '🤝' },
    { key: 'active',   label: '身體活動',   need: '想動一動、運動',           icon: '🚶' },
    { key: 'learning', label: '藝文學習',   need: '想學新東西、做喜歡的事',   icon: '🎨' },
    { key: 'nature',   label: '自然綠色',   need: '想親近大自然',             icon: '🌱' },
    { key: 'mental',   label: '心理支持',   need: '心情低落、壓力大',         icon: '💬' },
    { key: 'living',   label: '生活協助',   need: '經濟、工作、法律或住的問題', icon: '🏠' },
    { key: 'carer',    label: '照顧者支持', need: '照顧家人好累',             icon: '🫶' }
  ]
};
