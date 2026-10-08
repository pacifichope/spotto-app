export type Locale = 'ja' | 'en';

/** ネストした辞書。キーはドット区切りで参照する */
export type MessageTree = { [key: string]: string | MessageTree };
