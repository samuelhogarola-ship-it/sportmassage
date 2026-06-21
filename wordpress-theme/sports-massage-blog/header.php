<?php
if (!defined('ABSPATH')) {
    exit;
}
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<header class="site-header">
    <div class="site-bar">
        <a class="brand" href="<?php echo esc_url(sports_massage_blog_main_url('/')); ?>">
            <?php if (has_custom_logo()) : ?>
                <?php the_custom_logo(); ?>
            <?php endif; ?>
            <div class="brand-text">
                <?php bloginfo('name'); ?>
                <span><?php bloginfo('description'); ?></span>
            </div>
        </a>

        <nav class="main-navigation" aria-label="<?php esc_attr_e('Primary navigation', 'sports-massage-blog'); ?>">
            <?php
            wp_nav_menu(
                array(
                    'theme_location' => 'primary',
                    'container'      => false,
                    'fallback_cb'    => 'sports_massage_blog_menu_fallback',
                )
            );
            ?>
        </nav>
    </div>
</header>
