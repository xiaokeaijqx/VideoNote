import request from '@/utils/request.ts'

export const getDownloaderCookie = async id => {
  return await request.get('/get_downloader_cookie/' + id)
}

export const updateDownloaderCookie = async (data: {
  cookie: string
  platform: any
  /** 可选：从浏览器读 cookie（yt-dlp cookiesfrombrowser）。空字符串=清除。 */
  browser?: string
}) => {
  return await request.post('/update_downloader_cookie', data)
}

export interface CustomPlatform {
  key: string
  name: string
  match: string
}

export const listCustomPlatforms = async (): Promise<CustomPlatform[]> => {
  return await request.get('/custom_platforms')
}

export const upsertCustomPlatform = async (data: CustomPlatform): Promise<CustomPlatform> => {
  return await request.post('/custom_platforms', data)
}

export const deleteCustomPlatform = async (key: string) => {
  return await request.delete('/custom_platforms/' + key)
}
