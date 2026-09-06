import { Button, Result } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <Result
      status="404"
      title={t('common.notFoundTitle')}
      subTitle={t('common.notFoundSubtitle')}
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          {t('common.backToHome')}
        </Button>
      }
    />
  )
}
