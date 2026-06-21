<?php
if (!defined('ABSPATH')) {
    exit;
}

if (is_active_sidebar('sidebar-1')) {
    dynamic_sidebar('sidebar-1');
    return;
}
?>
<section class="widget-panel widget">
    <h2 class="widget-title"><?php esc_html_e('Sobre el blog', 'sports-massage-blog'); ?></h2>
    <p><?php esc_html_e('Plantilla basada en la estética de Sports Massage in Fuengirola para construir un blog elegante y coherente con la marca.', 'sports-massage-blog'); ?></p>
</section>

<section class="widget-panel widget">
    <h2 class="widget-title"><?php esc_html_e('Ideas de contenido', 'sports-massage-blog'); ?></h2>
    <ul>
        <li><?php esc_html_e('Recuperación muscular', 'sports-massage-blog'); ?></li>
        <li><?php esc_html_e('Bienestar y estrés', 'sports-massage-blog'); ?></li>
        <li><?php esc_html_e('Bruxismo y masaje intraoral', 'sports-massage-blog'); ?></li>
        <li><?php esc_html_e('Masaje deportivo y golf', 'sports-massage-blog'); ?></li>
    </ul>
</section>
