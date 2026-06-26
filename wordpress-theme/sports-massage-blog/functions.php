<?php
if (!defined('ABSPATH')) {
    exit;
}

function sports_massage_blog_setup() {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script'));
    add_theme_support('custom-logo', array(
        'height'      => 96,
        'width'       => 96,
        'flex-height' => true,
        'flex-width'  => true,
    ));

    register_nav_menus(
        array(
            'primary' => __('Primary Menu', 'sports-massage-blog'),
        )
    );
}
add_action('after_setup_theme', 'sports_massage_blog_setup');

function sports_massage_blog_main_url($path = '') {
    return 'https://sportmassagefuengirola.com' . $path;
}

function sports_massage_blog_whatsapp_url() {
    return 'https://wa.me/34743017527';
}

function sports_massage_blog_assets() {
    wp_enqueue_style(
        'sports-massage-blog-fonts',
        'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Jost:wght@200;300;400;500&display=swap',
        array(),
        null
    );

    wp_enqueue_style(
        'sports-massage-blog-style',
        get_stylesheet_uri(),
        array('sports-massage-blog-fonts'),
        wp_get_theme()->get('Version')
    );
}
add_action('wp_enqueue_scripts', 'sports_massage_blog_assets');

function sports_massage_blog_widgets() {
    register_sidebar(
        array(
            'name'          => __('Sidebar', 'sports-massage-blog'),
            'id'            => 'sidebar-1',
            'before_widget' => '<section class="widget-panel widget">',
            'after_widget'  => '</section>',
            'before_title'  => '<h2 class="widget-title">',
            'after_title'   => '</h2>',
        )
    );
}
add_action('widgets_init', 'sports_massage_blog_widgets');

function sports_massage_blog_menu_fallback() {
    echo '<ul>';
    echo '<li><a href="' . esc_url(sports_massage_blog_main_url('/')) . '">' . esc_html__('Home', 'sports-massage-blog') . '</a></li>';
    echo '<li><a href="' . esc_url(sports_massage_blog_main_url('/blog')) . '">' . esc_html__('Blog', 'sports-massage-blog') . '</a></li>';
    echo '<li><a href="' . esc_url(sports_massage_blog_main_url('/#servicios')) . '">' . esc_html__('Services', 'sports-massage-blog') . '</a></li>';
    echo '<li><a href="' . esc_url(sports_massage_blog_main_url('/#sobre-mi')) . '">' . esc_html__('About', 'sports-massage-blog') . '</a></li>';
    echo '<li><a href="' . esc_url(sports_massage_blog_main_url('/#contacto')) . '">' . esc_html__('Contact', 'sports-massage-blog') . '</a></li>';
    echo '</ul>';
}
